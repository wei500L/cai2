from __future__ import annotations

from os import getenv
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.clock import Clock
from app.core.errors import DiplomacyError
from app.core.logging import get_logger
from app.domain.enums import EventKind, EventPriority, FactionId, GamePhase, VisibilityScope
from app.domain.factions import FACTION_LABELS
from app.domain.models import (
    AISpeechItem,
    BattleEvent,
    DiaryEntry,
    FactionStatChange,
    FactionState,
    GameEvent,
    GameRoom,
    MapRegion,
    MessageVisibility,
    Relationship,
    SettlementResult,
    Treaty,
)
from app.domain.world_geometry import WorldGeometry
from app.domain.world_lighting import WorldLightingPolicy
from app.game.explosion_resolver import ExplosionResolution, resolve_explosion
from app.game.map_neighbors import build_region_neighbors
from app.game.relationships_init import relationship_status_for_value
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator, SettlementInput
from app.llm.client import LLMClient, LLMRequest
from app.llm.output_parser import ModelOutputParser
from app.llm.output_schema import SettlementModelOutput
from app.llm.prompt_builder import PromptBuilder
from app.llm.retry import call_with_retry
from app.repositories.factory import Repositories
from app.services.ai_output_service import AIOutputBundle, AIOutputService
from app.services.ai_templates import (
    AI_PRIVATE_TEMPLATES,
    AI_REACTION_TEMPLATES,
    AI_SPEECH_TEMPLATES,
)
from app.services.arc_builder import (
    ArcSpec,
    Capital,
    RippleSpec,
    build_arcs_from_events,
    build_ripples_from_events,
)
from app.services.epoch_narration_service import (
    EpochNarrationBundle,
    build_epoch_narration_state,
    generate_epic_narration,
    generate_summary_narration,
)
from app.services.scorched_service import ScorchedService

logger = get_logger(__name__)

_TOTAL_POWER_WEIGHTS = {
    "military": 0.35,
    "economy": 0.25,
    "diplomacy": 0.25,
    "culture": 0.15,
}


class SettlementOutboundBundle(BaseModel):
    model_config = ConfigDict(strict=True)

    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    seq_base: int
    resolve_events: list[dict[str, Any]]
    resolve_map_diff: dict[str, Any]
    resolve_stats_diff: dict[str, Any]
    resolve_diplomatic_arcs: list[ArcSpec] = Field(default_factory=list)
    resolve_explosions: list[Any] = Field(default_factory=list)
    resolve_scorched_diff: list[Any] = Field(default_factory=list)
    resolve_ripples: list[RippleSpec] = Field(default_factory=list)
    ai_speech_events: list[dict[str, Any]]
    resolve_world_lighting: dict[str, Any] | None = None


class SettlementService:
    def __init__(
        self,
        *,
        repos: Repositories,
        clock: Clock,
        aggregator: SettlementAggregator,
        prompt_builder: PromptBuilder,
        llm_client: LLMClient,
        parser: ModelOutputParser,
        rule_resolver: RuleResolver,
        ai_output_service: AIOutputService | None = None,
        scorched_service: ScorchedService | None = None,
        lighting_policy: WorldLightingPolicy | None = None,
        lighting_dynamic: bool | None = None,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._aggregator = aggregator
        self._prompt_builder = prompt_builder
        self._llm_client = llm_client
        self._parser = parser
        self._rule_resolver = rule_resolver
        self._ai_output_service = ai_output_service or AIOutputService(
            repos=repos,
            clock=clock,
            rng_seed=0,
        )
        self._scorched_service = scorched_service or ScorchedService()
        self._lighting_policy = lighting_policy or WorldLightingPolicy()
        self._lighting_dynamic = (
            _read_bool_env("LIGHTING_DYNAMIC", False)
            if lighting_dynamic is None
            else lighting_dynamic
        )

    async def run_turn_settlement(
        self,
        room_id: str,
        epoch: int,
        turn: int,
    ) -> SettlementOutboundBundle:
        self._log_step(room_id, epoch, turn, "aggregate")
        try:
            settlement_input = await self._aggregator.aggregate(room_id, epoch, turn)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "aggregate", error)
            raise DiplomacyError("failed to aggregate settlement input") from error

        self._log_step(room_id, epoch, turn, "build_prompt")
        prompt = self._prompt_builder.build_settlement_prompt(settlement_input)
        llm_request = LLMRequest(
            system=prompt.system,
            user=prompt.user,
            temperature=prompt.temperature,
            max_tokens=prompt.max_tokens,
            metadata={"room_id": room_id, "epoch": epoch, "turn": turn},
        )

        self._log_step(room_id, epoch, turn, "call_llm")
        llm_content = await self._call_llm_or_fallback_text(room_id, epoch, turn, llm_request)

        self._log_step(room_id, epoch, turn, "parse_model_output")
        model_output = self._parser.parse(llm_content)

        self._log_step(room_id, epoch, turn, "resolve_rules")
        settlement_result = self._rule_resolver.resolve(settlement_input, model_output)

        self._log_step(room_id, epoch, turn, "resolve_explosions")
        try:
            explosion_resolutions = await self._resolve_explosions(
                settlement_result,
                settlement_input,
            )
            scorched_diff = self._scorched_service.advance(turn)
            scorched_diff.extend(self._scorched_service.apply(explosion_resolutions, turn))
            settlement_result = self._apply_scorched_economic_loss(
                settlement_input,
                settlement_result,
                turn,
            )
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "resolve_explosions", error)
            raise DiplomacyError("failed to resolve explosion effects") from error

        self._log_step(room_id, epoch, turn, "write_diary")
        try:
            await self._write_diary_entries(room_id, epoch, turn, model_output)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "write_diary", error)
            raise DiplomacyError("failed to write diary entries") from error

        self._log_step(room_id, epoch, turn, "build_ai_speech_plan")
        try:
            ai_speech_items = await self._build_ai_speech_plan(
                room_id,
                settlement_input,
                settlement_result,
            )
            augmented_model_output = model_output.model_copy(
                update={
                    "ai_speeches": [
                        *model_output.ai_speeches,
                        *ai_speech_items,
                    ],
                },
            )
            settlement_result = settlement_result.model_copy(
                update={"ai_speeches": list(augmented_model_output.ai_speeches)},
            )
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "build_ai_speech_plan", error)
            raise DiplomacyError("failed to build AI speech plan") from error

        self._log_step(room_id, epoch, turn, "save_settlement")
        try:
            await self._repos.settlements.save(settlement_result)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "save_settlement", error)
            raise DiplomacyError("failed to save settlement result") from error

        self._log_step(room_id, epoch, turn, "apply_state")
        try:
            await self._apply_settlement_to_state(settlement_input, settlement_result)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "apply_state", error)
            raise DiplomacyError("failed to apply settlement result to game state") from error

        self._log_step(room_id, epoch, turn, "generate_ai_output")
        try:
            ai_output = await self._ai_output_service.generate_ai_reactions_from_settlement(
                room_id,
                epoch,
                turn,
                augmented_model_output,
                factions_snapshot=settlement_input.factions_snapshot,
                recent_events=settlement_input.recent_events,
            )
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "generate_ai_output", error)
            raise DiplomacyError("failed to generate AI output") from error

        self._log_step(room_id, epoch, turn, "build_outbound")
        seq_base = self._repos.events.next_seq(room_id)
        visual_events = _visual_source_events(settlement_result, settlement_input)
        capitals = _capital_map(settlement_input.world_geometry)
        bundle = SettlementOutboundBundle(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            generated_at_ms=self._clock.now_ms(),
            seq_base=seq_base,
            resolve_events=[
                *_build_resolve_events(settlement_result, settlement_input),
                *ai_output.narration_events,
            ],
            resolve_map_diff=_build_map_diff(settlement_result, settlement_input),
            resolve_stats_diff=_build_stats_diff(settlement_result, settlement_input),
            resolve_diplomatic_arcs=build_arcs_from_events(visual_events, capitals),
            resolve_explosions=[
                resolution.payload.model_dump(mode="json") for resolution in explosion_resolutions
            ],
            resolve_scorched_diff=[
                change.model_dump(mode="json") for change in scorched_diff
            ],
            resolve_ripples=build_ripples_from_events(visual_events, capitals),
            ai_speech_events=_build_ai_output_events(ai_output),
            resolve_world_lighting=_build_world_lighting(
                room_id=room_id,
                epoch=epoch,
                turn=turn,
                lighting_policy=self._lighting_policy if self._lighting_dynamic else None,
            ),
        )

        self._log_step(room_id, epoch, turn, "append_events")
        try:
            for event in _events_for_log(settlement_result, settlement_input):
                await self._repos.events.append(event)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "append_events", error)
            raise DiplomacyError("failed to append settlement events") from error

        self._log_step(room_id, epoch, turn, "complete")
        return bundle

    async def run_epoch_settlement(self, room_id: str, epoch: int) -> EpochNarrationBundle:
        self._log_step(room_id, epoch, 0, "aggregate_epoch")
        try:
            epoch_state = await build_epoch_narration_state(
                self._repos,
                self._clock,
                room_id,
                epoch,
            )
        except Exception as error:
            self._log_repo_error(room_id, epoch, 0, "aggregate_epoch", error)
            raise DiplomacyError("failed to aggregate epoch narration state") from error

        self._log_step(room_id, epoch, epoch_state.turn, "generate_epic_narration")
        try:
            epic_narration = await generate_epic_narration(epoch_state, self._llm_client)
        except Exception as error:
            self._log_repo_error(room_id, epoch, epoch_state.turn, "generate_epic_narration", error)
            raise DiplomacyError("failed to generate epic narration") from error

        self._log_step(room_id, epoch, epoch_state.turn, "generate_summary_narration")
        try:
            summary_narration = await generate_summary_narration(epoch_state, self._llm_client)
        except Exception as error:
            self._log_repo_error(
                room_id,
                epoch,
                epoch_state.turn,
                "generate_summary_narration",
                error,
            )
            raise DiplomacyError("failed to generate summary narration") from error

        self._log_step(room_id, epoch, epoch_state.turn, "save_epoch_narration")
        seq_base = self._repos.events.next_seq(room_id)
        epic_event = _build_narration_event(
            room_id=room_id,
            epoch=epoch,
            turn=epoch_state.turn,
            seq=seq_base,
            payload=epic_narration,
            created_at_ms=epoch_state.generated_at_ms,
            narrative=epic_narration.narrative,
            kind="epic",
        )
        summary_event = _build_narration_event(
            room_id=room_id,
            epoch=epoch,
            turn=epoch_state.turn,
            seq=seq_base + 1,
            payload=summary_narration,
            created_at_ms=epoch_state.generated_at_ms,
            narrative=summary_narration.headline,
            kind="summary",
        )

        try:
            await self._repos.events.append(epic_event)
            await self._repos.events.append(summary_event)
        except Exception as error:
            self._log_repo_error(room_id, epoch, epoch_state.turn, "save_epoch_narration", error)
            raise DiplomacyError("failed to save epoch narration events") from error

        return EpochNarrationBundle(
            room_id=room_id,
            epoch=epoch,
            turn=epoch_state.turn,
            generated_at_ms=epoch_state.generated_at_ms,
            seq_base=seq_base,
            epic_narration=epic_narration,
            summary_narration=summary_narration,
        )

    async def _call_llm_or_fallback_text(
        self,
        room_id: str,
        epoch: int,
        turn: int,
        request: LLMRequest,
    ) -> str:
        response = await call_with_retry(self._llm_client, request, max_retries=1)
        return response.content

    async def _resolve_explosions(
        self,
        result: SettlementResult,
        settlement_input: SettlementInput,
    ) -> list[ExplosionResolution]:
        resolutions: list[ExplosionResolution] = []
        if not result.battle_results:
            return resolutions

        scorched_state = self._scorched_service.state
        for event in result.battle_results:
            resolution = await resolve_explosion(
                event,
                settlement_input.world_geometry,
                scorched_state,
                self._llm_client,
            )
            resolutions.append(resolution)
        return resolutions

    def _apply_scorched_economic_loss(
        self,
        settlement_input: SettlementInput,
        result: SettlementResult,
        turn: int,
    ) -> SettlementResult:
        changes = list(result.faction_stat_changes)
        factions_by_id = {faction.id: faction for faction in settlement_input.factions_snapshot}
        impacted: set[FactionId] = set()

        for entry in self._scorched_service.state.values():
            if entry.owner_faction_id is None or entry.ttl_turns <= 0:
                continue
            try:
                impacted.add(FactionId(entry.owner_faction_id))
            except Exception:
                continue

        for faction_id in sorted(impacted, key=str):
            faction = factions_by_id.get(faction_id)
            if faction is None:
                continue
            impact = self._scorched_service.economic_impact(faction_id, turn)
            if impact <= 0:
                continue
            changes.append(
                FactionStatChange(
                    faction_id=faction_id,
                    military_delta=0.0,
                    economy_delta=round(-faction.economy * impact, 4),
                    diplomacy_delta=0.0,
                    culture_delta=0.0,
                    morale_delta=0.0,
                    reason=f"scorched:{turn}:{impact:.4f}",
                )
            )

        if len(changes) == len(result.faction_stat_changes):
            return result

        return result.model_copy(update={"faction_stat_changes": changes})

    async def _apply_settlement_to_state(
        self,
        settlement_input: SettlementInput,
        result: SettlementResult,
    ) -> None:
        room_id = settlement_input.room_id
        await self._repos.state.save_factions(
            room_id,
            _apply_faction_changes(settlement_input.factions_snapshot, result),
        )
        await self._repos.state.save_relationships(
            room_id,
            _apply_relationship_changes(settlement_input.relationships_snapshot, result),
        )
        await self._repos.state.save_regions(
            room_id,
            _apply_region_changes(settlement_input.regions_snapshot, result),
        )
        await self._repos.state.save_treaties(
            room_id,
            _apply_treaty_changes(settlement_input.treaties_snapshot, result),
        )

    async def _write_diary_entries(
        self,
        room_id: str,
        epoch: int,
        turn: int,
        model_output: SettlementModelOutput,
    ) -> None:
        for item in model_output.ai_speeches:
            thought = (item.internal_thought or "").strip() or "（无内心独白）"  # noqa: RUF001
            await self._repos.diaries.append(
                DiaryEntry(
                    faction_id=item.faction_id,
                    epoch=epoch,
                    turn=turn,
                    internal_thought=thought,
                    emotion="（未知）",  # noqa: RUF001
                    triggers=[],
                    created_at_ms=self._clock.now_ms(),
                ),
                room_id=room_id,
            )

    async def _build_ai_speech_plan(
        self,
        room_id: str,
        settlement_input: SettlementInput,
        settlement_result: SettlementResult,
    ) -> list[AISpeechItem]:
        room = await self._repos.rooms.get(room_id)
        ai_factions = _room_ai_factions(room)
        ai_speeches: list[AISpeechItem] = []

        for action in settlement_input.public_speeches:
            responders = _other_ai_factions(ai_factions, action.actor_faction)
            for faction_id in responders:
                ai_speeches.append(
                    AISpeechItem(
                        faction_id=faction_id,
                        kind="public",
                        content=_render_ai_content(
                            AI_SPEECH_TEMPLATES,
                            faction_id,
                            target_faction=action.actor_faction,
                            epoch=settlement_input.epoch,
                        ),
                        target_faction=action.actor_faction,
                        target_event_id=action.id,
                    )
                )
            for faction_id in responders:
                ai_speeches.append(
                    AISpeechItem(
                        faction_id=faction_id,
                        kind="reaction",
                        content=_render_ai_content(
                            AI_REACTION_TEMPLATES,
                            faction_id,
                            target_faction=action.actor_faction,
                            epoch=settlement_input.epoch,
                        ),
                        target_faction=action.actor_faction,
                        target_event_id=action.id,
                    )
                )

        for action in settlement_input.private_messages:
            target = action.target_faction
            if target not in ai_factions:
                continue
            ai_speeches.append(
                AISpeechItem(
                    faction_id=target,
                    kind="private",
                    content=_render_ai_content(
                        AI_PRIVATE_TEMPLATES,
                        target,
                        target_faction=action.actor_faction,
                        epoch=settlement_input.epoch,
                    ),
                    target_faction=action.actor_faction,
                    target_event_id=action.id,
                )
            )

        for action in settlement_input.treaty_requests:
            responders = [
                target
                for target in action.target_factions
                if target in ai_factions and target != action.actor_faction
            ]
            for faction_id in responders:
                ai_speeches.append(
                    AISpeechItem(
                        faction_id=faction_id,
                        kind="public",
                        content=_render_ai_content(
                            AI_SPEECH_TEMPLATES,
                            faction_id,
                            target_faction=action.actor_faction,
                            epoch=settlement_input.epoch,
                        ),
                        target_faction=action.actor_faction,
                        target_event_id=action.id,
                    )
                )

        attack_orders = {
            order.target_region: order
            for order in settlement_input.military_orders
            if order.movement == "attack"
        }
        seen_battles: set[tuple[str, str]] = set()
        for battle in settlement_result.battle_results:
            battle_key = (str(battle.attacker), str(battle.defender))
            if battle_key in seen_battles:
                continue
            seen_battles.add(battle_key)
            order = attack_orders.get(battle.region_id)
            if order is None:
                continue

            defender = battle.defender
            if defender in ai_factions:
                ai_speeches.append(
                    AISpeechItem(
                        faction_id=defender,
                        kind="public",
                        content=_render_ai_content(
                            AI_SPEECH_TEMPLATES,
                            defender,
                            target_faction=order.actor_faction,
                            epoch=settlement_input.epoch,
                        ),
                        target_faction=order.actor_faction,
                        target_event_id=order.id,
                    )
                )

            for faction_id in _other_ai_factions(
                ai_factions,
                order.actor_faction,
                defender,
            ):
                ai_speeches.append(
                    AISpeechItem(
                        faction_id=faction_id,
                        kind="reaction",
                        content=_render_ai_content(
                            AI_REACTION_TEMPLATES,
                            faction_id,
                            target_faction=order.actor_faction,
                            epoch=settlement_input.epoch,
                        ),
                        target_faction=order.actor_faction,
                        target_event_id=order.id,
                    )
                )

        return ai_speeches

    @staticmethod
    def _log_step(room_id: str, epoch: int, turn: int, step: str) -> None:
        logger.info(
            "settlement step room_id=%s epoch=%s turn=%s step=%s",
            room_id,
            epoch,
            turn,
            step,
        )

    @staticmethod
    def _log_repo_error(room_id: str, epoch: int, turn: int, step: str, error: Exception) -> None:
        logger.error(
            "settlement repository failure room_id=%s epoch=%s turn=%s step=%s error=%s",
            room_id,
            epoch,
            turn,
            step,
            error,
        )


def _build_resolve_events(
    result: SettlementResult,
    input: SettlementInput,
) -> list[dict[str, Any]]:
    del input
    events: list[dict[str, Any]] = []
    for event in result.narration_events:
        events.append(_dump_event(event))
    for event in result.battle_results:
        events.append(_dump_event(event))
    return events


def _build_map_diff(
    result: SettlementResult,
    input: SettlementInput,
) -> dict[str, Any]:
    before_regions = {region.id: region for region in input.regions_snapshot}
    projected_regions = _apply_region_changes(input.regions_snapshot, result)
    projected_relationships = _apply_relationship_changes(input.relationships_snapshot, result)
    changes = []
    for change in result.region_changes:
        before = before_regions.get(change.region_id)
        changes.append(
            {
                "region_id": change.region_id,
                "prev_owner": _value(change.prev_owner),
                "new_owner": _value(change.new_owner),
                "transition": change.transition,
                "animation_params": change.animation_params
                or _animation_params_for_transition(change.transition),
                "previous": _dump_region_entry(before),
            }
        )

    return {
        "changes": changes,
        "border_updates": _build_border_updates(
            projected_regions,
            projected_relationships,
            result.battle_results,
            getattr(input, "world_geometry", None),
        ),
    }


def _build_border_updates(
    regions: list[MapRegion],
    relationships: list[Relationship],
    battle_results: list[BattleEvent],
    world_geometry: WorldGeometry | None = None,
) -> list[dict[str, Any]]:
    adjacency_pairs = (
        _adjacent_faction_pairs_from_world_geometry(world_geometry)
        if world_geometry is not None
        else _adjacent_faction_pairs(regions)
    )
    relationship_by_pair = _best_relationship_by_pair(relationships)
    battle_pairs = {
        _sorted_faction_pair(battle.attacker, battle.defender)
        for battle in battle_results
        if getattr(battle, "attacker", None) is not None
        and getattr(battle, "defender", None) is not None
    }

    updates: list[dict[str, Any]] = []
    for between in sorted(adjacency_pairs):
        relationship = relationship_by_pair.get(between)
        tension = 0.0
        visual_state = "calm"
        if relationship is not None and relationship.status in {"hostile", "wary"}:
            tension = round(_clamp(abs(relationship.value) / 100.0, 0.0, 1.0), 4)
            visual_state = "hostile_sparking" if relationship.status == "hostile" else "tense"
            if between in battle_pairs and relationship.status == "hostile":
                visual_state = "war_frontline"

        updates.append(
            {
                "between": [between[0], between[1]],
                "tension": tension,
                "visual_state": visual_state,
            }
        )

    return updates


def _adjacent_faction_pairs(regions: list[MapRegion]) -> set[tuple[str, str]]:
    regions_by_id = {region.id: region for region in regions}
    pairs: set[tuple[str, str]] = set()

    for region in regions:
        if region.owner is None or not region.neighbors:
            continue

        for neighbor_id in region.neighbors:
            neighbor = regions_by_id.get(neighbor_id)
            if neighbor is None or neighbor.owner is None or neighbor.id == region.id:
                continue
            if neighbor.owner == region.owner:
                continue

            pairs.add(_sorted_faction_pair(region.owner, neighbor.owner))

    return pairs


def _adjacent_faction_pairs_from_world_geometry(
    world_geometry: WorldGeometry,
) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    cells = world_geometry.cells

    for index, cell in enumerate(cells):
        for neighbor_index in cell.neighbors:
            if neighbor_index <= index or neighbor_index >= len(cells):
                continue
            neighbor = cells[neighbor_index]
            if neighbor.faction_id == cell.faction_id:
                continue
            pairs.add(_sorted_faction_pair(cell.faction_id, neighbor.faction_id))

    return pairs


def _best_relationship_by_pair(
    relationships: list[Relationship],
) -> dict[tuple[str, str], Relationship]:
    relationship_by_pair: dict[tuple[str, str], Relationship] = {}

    for relationship in relationships:
        pair = _sorted_faction_pair(relationship.from_faction, relationship.to_faction)
        existing = relationship_by_pair.get(pair)
        if existing is None or (
            _relationship_priority(relationship) > _relationship_priority(existing)
        ):
            relationship_by_pair[pair] = relationship

    return relationship_by_pair


def _relationship_priority(relationship: Relationship) -> tuple[float, int]:
    status_rank = {
        "hostile": 3,
        "wary": 2,
        "neutral": 1,
        "friendly": 0,
        "allied": 0,
    }
    return (-relationship.value, status_rank.get(relationship.status, 0))


def _sorted_faction_pair(left: str, right: str) -> tuple[str, str]:
    ordered = sorted((str(left), str(right)))
    return ordered[0], ordered[1]


def _animation_params_for_transition(transition: str) -> dict[str, Any]:
    presets: dict[str, tuple[str, float, str]] = {
        "conquest": ("south_to_north", 1.2, "aggressive"),
        "cede": ("north_to_south", 0.95, "neutral"),
        "negotiated": ("west_to_east", 1.0, "neutral"),
        "abandoned": ("east_to_west", 0.85, "neutral"),
    }
    direction, speed, particles = presets.get(transition, ("west_to_east", 1.0, "neutral"))
    return {
        "direction": direction,
        "speed": speed,
        "particles": particles,
    }


def _build_stats_diff(
    result: SettlementResult,
    input: SettlementInput,
) -> dict[str, Any]:
    del input
    return {
        "faction_stats": [_dump_model(change) for change in result.faction_stat_changes],
        "relationship_changes": [
            _dump_model(delta) for delta in result.relationship_deltas
        ],
        "treaty_decisions": [_dump_model(decision) for decision in result.treaty_decisions],
        "created_treaties": [_dump_model(treaty) for treaty in result.created_treaties],
    }


def _visual_source_events(
    result: SettlementResult,
    input: SettlementInput,
) -> list[GameEvent]:
    current_turn_events = [
        event
        for event in input.recent_events
        if event.epoch == input.epoch and event.turn == input.turn
    ]
    return [
        *current_turn_events,
        *result.narration_events,
        *result.battle_results,
    ]


def _capital_map(world_geometry: WorldGeometry | None) -> dict[FactionId, Capital]:
    if world_geometry is None:
        return {}
    return {
        faction_id: (lat, lng)
        for faction_id, lat, lng in world_geometry.capitals
    }


def _build_ai_speech_events(
    result: SettlementResult,
    input: SettlementInput,
) -> list[dict[str, Any]]:
    return [
        _dump_event(_ai_speech_to_event(item, input, index))
        for index, item in enumerate(result.ai_speeches)
    ]


def _build_world_lighting(
    *,
    room_id: str,
    epoch: int,
    turn: int,
    lighting_policy: WorldLightingPolicy | None,
) -> dict[str, Any] | None:
    if lighting_policy is None:
        return None

    lighting = lighting_policy.next(turn)
    return {
        "room_id": room_id,
        "epoch": epoch,
        "turn": turn,
        "sun_lat": lighting.sun_lat,
        "sun_lng": lighting.sun_lng,
        "day_color": lighting.day_color,
        "night_color": lighting.night_color,
        "phase_label": lighting.phase_label,
    }


def _build_ai_output_events(ai_output: AIOutputBundle) -> list[dict[str, Any]]:
    return [
        *ai_output.ai_speak_events,
        *ai_output.private_message_events,
        *ai_output.ai_reaction_events,
    ]


def _room_ai_factions(room: GameRoom | None) -> set[FactionId]:
    if room is None:
        return set(FactionId)
    return {FactionId(str(faction_id)) for faction_id in room.ai_factions}


def _other_ai_factions(
    ai_factions: set[FactionId],
    *excluded: FactionId | None,
) -> list[FactionId]:
    excluded_ids = {faction_id for faction_id in excluded if faction_id is not None}
    return sorted(
        [faction_id for faction_id in ai_factions if faction_id not in excluded_ids],
        key=str,
    )


def _render_ai_content(
    templates: dict[FactionId, list[str]],
    faction_id: FactionId,
    *,
    target_faction: FactionId | None,
    epoch: int,
) -> str:
    pool = templates.get(faction_id) or []
    template = pool[0] if pool else "{faction}对{target}做出回应。"
    target_label = (
        FACTION_LABELS.get(target_faction, "各方") if target_faction is not None else "各方"
    )
    return template.format(
        faction=FACTION_LABELS.get(faction_id, str(faction_id)),
        target=target_label,
        epoch=epoch,
    )


def compute_border_tension(
    regions: list[MapRegion],
    relationships: list[Relationship],
) -> list[dict[str, Any]]:
    if not regions:
        return []

    fallback_neighbors = build_region_neighbors(regions)
    neighbor_map = {
        region.id: list(getattr(region, "neighbors", None) or fallback_neighbors.get(region.id, []))
        for region in regions
    }

    regions_by_id = {region.id: region for region in regions}
    relationship_values: dict[tuple[str, str], list[float]] = {}
    for relationship in relationships:
        pair = _sorted_faction_pair(relationship.from_faction, relationship.to_faction)
        relationship_values.setdefault(pair, []).append(float(relationship.value))

    border_pairs: dict[tuple[str, str], float] = {}
    for region in regions:
        if region.owner is None:
            continue

        for neighbor_id in neighbor_map.get(region.id, []):
            neighbor = regions_by_id.get(neighbor_id)
            if neighbor is None or neighbor.owner is None or neighbor.owner == region.owner:
                continue

            pair = _sorted_faction_pair(region.owner, neighbor.owner)
            values = relationship_values.get(pair)
            if not values:
                continue

            border_pairs.setdefault(pair, sum(values) / len(values))

    tensions: list[dict[str, Any]] = []
    for pair, relationship_value in sorted(border_pairs.items()):
        tension = round(_clamp((100.0 - relationship_value) / 2.0, 0.0, 100.0))
        if tension < 35:
            visual_state = "calm"
        elif tension < 60:
            visual_state = "watch"
        elif tension < 80:
            visual_state = "tense"
        else:
            visual_state = "critical"

        tensions.append(
            {
                "between": [pair[0], pair[1]],
                "tension": tension,
                "visual_state": visual_state,
            }
        )

    return tensions


def _events_for_log(result: SettlementResult, input: SettlementInput) -> list[GameEvent]:
    del input
    return [*result.narration_events, *result.battle_results]


def _ai_speech_to_event(item: AISpeechItem, input: SettlementInput, index: int) -> GameEvent:
    visibility = _ai_speech_visibility(item)
    return GameEvent(
        id=f"settlement:{input.room_id}:{input.epoch}:{input.turn}:ai-speech:{index}",
        room_id=input.room_id,
        epoch=input.epoch,
        turn=input.turn,
        phase=GamePhase.resolve,
        created_at_ms=input.generated_at_ms,
        priority=EventPriority.P1,
        kind=_ai_speech_event_kind(item),
        actor_faction=item.faction_id,
        target_faction=item.target_faction,
        payload={"source": "model", "kind": item.kind, "content": item.content},
        narration=item.content,
        visibility=visibility,
    )


def _ai_speech_visibility(item: AISpeechItem) -> MessageVisibility:
    if item.kind == "private" and item.target_faction is not None:
        return MessageVisibility(
            scope=VisibilityScope.faction_pair,
            faction_ids=[item.faction_id, item.target_faction],
        )
    if item.kind == "private":
        return MessageVisibility(scope=VisibilityScope.self, faction_ids=[item.faction_id])
    return MessageVisibility(scope=VisibilityScope.public, faction_ids=[])


def _ai_speech_event_kind(item: AISpeechItem) -> EventKind:
    if item.kind == "private":
        return EventKind.private
    if item.kind == "public":
        return EventKind.speech
    return EventKind.ai_reaction


def _apply_faction_changes(
    current_factions: list[FactionState],
    result: SettlementResult,
) -> list[FactionState]:
    changes = {change.faction_id: change for change in result.faction_stat_changes}
    updated: list[FactionState] = []
    for faction in current_factions:
        change = changes.get(faction.id)
        if change is None:
            updated.append(faction.model_copy(deep=True))
            continue

        military = _project_stat(faction.military, change.resulting_military, change.military_delta)
        economy = _project_stat(faction.economy, change.resulting_economy, change.economy_delta)
        diplomacy = _project_stat(
            faction.diplomacy,
            change.resulting_diplomacy,
            change.diplomacy_delta,
        )
        culture = _project_stat(faction.culture, change.resulting_culture, change.culture_delta)
        morale = _clamp(
            _project_stat(faction.morale, change.resulting_morale, change.morale_delta),
            0.3,
            1.8,
        )
        total_power = change.resulting_total_power
        if total_power is None:
            total_power = _total_power(
                military=military,
                economy=economy,
                diplomacy=diplomacy,
                culture=culture,
            )

        updated.append(
            faction.model_copy(
                update={
                    "military": round(max(0.0, military), 4),
                    "economy": round(max(0.0, economy), 4),
                    "diplomacy": round(max(0.0, diplomacy), 4),
                    "culture": round(max(0.0, culture), 4),
                    "morale": round(morale, 4),
                    "total_power": round(total_power, 4),
                },
                deep=True,
            )
        )
    return updated


def _apply_relationship_changes(
    current_relationships: list[Relationship],
    result: SettlementResult,
) -> list[Relationship]:
    relationship_by_key = {
        (rel.from_faction, rel.to_faction): rel.model_copy(deep=True)
        for rel in current_relationships
    }
    created_treaties = result.created_treaties

    for delta in result.relationship_deltas:
        key = (delta.from_faction, delta.to_faction)
        relationship = relationship_by_key.get(key)
        if relationship is None:
            relationship = Relationship(
                from_faction=delta.from_faction,
                to_faction=delta.to_faction,
                value=0.0,
                status=relationship_status_for_value(0.0),
                treaties=[],
                last_changed_turn=result.turn,
            )
        value = _clamp(relationship.value + delta.delta, -100.0, 100.0)
        relationship.value = round(value, 4)
        relationship.status = relationship_status_for_value(value)
        relationship.last_changed_turn = result.turn
        relationship_by_key[key] = relationship

    for treaty in created_treaties:
        for from_faction in treaty.parties:
            for to_faction in treaty.parties:
                if from_faction == to_faction:
                    continue
                key = (from_faction, to_faction)
                relationship = relationship_by_key.get(key)
                if relationship is None:
                    relationship = Relationship(
                        from_faction=from_faction,
                        to_faction=to_faction,
                        value=0.0,
                        status=relationship_status_for_value(0.0),
                        treaties=[],
                        last_changed_turn=result.turn,
                    )
                if treaty.kind not in relationship.treaties:
                    relationship.treaties.append(treaty.kind)
                relationship.last_changed_turn = result.turn
                relationship_by_key[key] = relationship

    return sorted(
        relationship_by_key.values(),
        key=lambda rel: (str(rel.from_faction), str(rel.to_faction)),
    )


def _apply_region_changes(
    current_regions: list[MapRegion],
    result: SettlementResult,
) -> list[MapRegion]:
    changes = {change.region_id: change for change in result.region_changes}
    updated: list[MapRegion] = []
    for region in current_regions:
        change = changes.get(region.id)
        if change is None:
            updated.append(region.model_copy(deep=True))
        else:
            updated.append(
                region.model_copy(
                    update={
                        "owner": change.new_owner,
                        "development_level": 0.3,
                        "resistance": 0.5,
                        "captured_at_turn": result.turn,
                    },
                    deep=True,
                )
            )
    return updated


def _apply_treaty_changes(
    current_treaties: list[Treaty],
    result: SettlementResult,
) -> list[Treaty]:
    treaty_by_id = {treaty.id: treaty.model_copy(deep=True) for treaty in current_treaties}
    for treaty in result.created_treaties:
        treaty_by_id[treaty.id] = treaty.model_copy(deep=True)
    return sorted(treaty_by_id.values(), key=lambda treaty: treaty.id)


def _project_stat(current: float, resulting: float | None, delta: float) -> float:
    if resulting is not None:
        return resulting
    return current + delta


def _total_power(
    *,
    military: float,
    economy: float,
    diplomacy: float,
    culture: float,
) -> float:
    return round(
        military * _TOTAL_POWER_WEIGHTS["military"]
        + economy * _TOTAL_POWER_WEIGHTS["economy"]
        + diplomacy * _TOTAL_POWER_WEIGHTS["diplomacy"]
        + culture * _TOTAL_POWER_WEIGHTS["culture"],
        4,
    )


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _read_bool_env(name: str, default: bool) -> bool:
    raw = getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _dump_event(event: GameEvent) -> dict[str, Any]:
    return _dump_model(event)


def _build_narration_event(
    *,
    room_id: str,
    epoch: int,
    turn: int,
    seq: int,
    payload: Any,
    created_at_ms: int,
    narrative: str,
) -> GameEvent:
    event_kind = "epic" if hasattr(payload, "narrative") else "summary"
    return GameEvent(
        id=f"arbitrate:{room_id}:{epoch}:{turn}:{seq}:{event_kind}",
        room_id=room_id,
        seq=seq,
        epoch=epoch,
        turn=turn,
        phase=GamePhase.arbitrate,
        created_at_ms=created_at_ms,
        priority=EventPriority.P1,
        kind=EventKind.narration,
        actor_faction=None,
        target_faction=None,
        payload=payload.model_dump(mode="json"),
        narration=narrative,
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


def _build_narration_event(
    *,
    room_id: str,
    epoch: int,
    turn: int,
    seq: int,
    payload: Any,
    created_at_ms: int,
    narrative: str,
    kind: str,
) -> GameEvent:
    return GameEvent(
        id=f"arbitrate:{room_id}:{epoch}:{turn}:{seq}:{kind}",
        room_id=room_id,
        seq=seq,
        epoch=epoch,
        turn=turn,
        phase=GamePhase.arbitrate,
        created_at_ms=created_at_ms,
        priority=EventPriority.P1,
        kind=EventKind.narration,
        actor_faction=None,
        target_faction=None,
        payload=payload.model_dump(mode="json"),
        narration=narrative,
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


def _dump_model(model: BaseModel | None) -> dict[str, Any] | None:
    if model is None:
        return None
    return model.model_dump(mode="json")


def _dump_region_entry(region: MapRegion | None) -> dict[str, Any] | None:
    if region is None:
        return None
    lat = region.lat if region.lat is not None else region.center_lat_lng[0]
    lng = region.lng if region.lng is not None else region.center_lat_lng[1]
    hex_id = region.hex_id if region.hex_id is not None else region.id
    payload = {
        "id": region.id,
        "owner": _value(region.owner),
        "resource_value": region.resource_value,
        "development_level": region.development_level,
        "terrain": _value(region.terrain),
        "center_lat_lng": list(region.center_lat_lng),
        "lat": lat,
        "lng": lng,
        "hex_id": hex_id,
        "min_garrison": region.min_garrison,
        "supply_lines": region.supply_lines,
        "neighbors": list(region.neighbors),
        "resistance": region.resistance,
    }
    if region.captured_at_turn is not None:
        payload["captured_at_turn"] = region.captured_at_turn
    return payload


def _value(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    return value
