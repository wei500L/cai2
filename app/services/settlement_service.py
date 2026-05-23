from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from app.core.clock import Clock
from app.core.errors import DiplomacyError
from app.core.logging import get_logger
from app.domain.enums import EventKind, EventPriority, GamePhase, VisibilityScope
from app.domain.models import (
    AISpeechItem,
    BattleEvent,
    DiaryEntry,
    FactionState,
    GameEvent,
    MapRegion,
    MessageVisibility,
    Relationship,
    SettlementResult,
    Treaty,
)
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
    ai_speech_events: list[dict[str, Any]]


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

        self._log_step(room_id, epoch, turn, "write_diary")
        try:
            await self._write_diary_entries(room_id, epoch, turn, model_output)
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "write_diary", error)
            raise DiplomacyError("failed to write diary entries") from error

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
                model_output,
                factions_snapshot=settlement_input.factions_snapshot,
                recent_events=settlement_input.recent_events,
            )
        except Exception as error:
            self._log_repo_error(room_id, epoch, turn, "generate_ai_output", error)
            raise DiplomacyError("failed to generate AI output") from error

        self._log_step(room_id, epoch, turn, "build_outbound")
        seq_base = self._repos.events.next_seq(room_id)
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
            ai_speech_events=_build_ai_output_events(ai_output),
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

    async def run_epoch_settlement(self, room_id: str, epoch: int) -> SettlementOutboundBundle:
        del room_id, epoch
        raise NotImplementedError("epoch settlement is reserved for the arbitrate summary phase")

    async def _call_llm_or_fallback_text(
        self,
        room_id: str,
        epoch: int,
        turn: int,
        request: LLMRequest,
    ) -> str:
        try:
            response = await call_with_retry(self._llm_client, request, max_retries=1)
            return response.content
        except Exception as error:
            logger.error(
                "settlement step failed room_id=%s epoch=%s turn=%s step=call_llm error=%s",
                room_id,
                epoch,
                turn,
                error,
            )
            return ""

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
                "animation_params": _animation_params_for_transition(change.transition),
                "previous": _dump_model(before) if before is not None else None,
            }
        )

    return {
        "changes": changes,
        "border_updates": _build_border_updates(
            projected_regions,
            projected_relationships,
            result.battle_results,
        ),
    }


def _build_border_updates(
    regions: list[MapRegion],
    relationships: list[Relationship],
    battle_results: list[BattleEvent],
) -> list[dict[str, Any]]:
    adjacency_pairs = _adjacent_faction_pairs(regions)
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
    presets: dict[str, tuple[str, float, int]] = {
        "conquest": ("inward", 1.2, 48),
        "cede": ("outward", 0.95, 32),
        "negotiated": ("drift", 0.7, 20),
        "abandoned": ("fade", 0.55, 12),
    }
    direction, speed, particles = presets.get(transition, ("drift", 0.8, 16))
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


def _build_ai_speech_events(
    result: SettlementResult,
    input: SettlementInput,
) -> list[dict[str, Any]]:
    return [
        _dump_event(_ai_speech_to_event(item, input, index))
        for index, item in enumerate(result.ai_speeches)
    ]


def _build_ai_output_events(ai_output: AIOutputBundle) -> list[dict[str, Any]]:
    return [
        *ai_output.ai_speak_events,
        *ai_output.private_message_events,
        *ai_output.ai_reaction_events,
    ]


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
            updated.append(region.model_copy(update={"owner": change.new_owner}, deep=True))
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


def _dump_event(event: GameEvent) -> dict[str, Any]:
    return _dump_model(event)


def _dump_model(model: BaseModel | None) -> dict[str, Any] | None:
    if model is None:
        return None
    return model.model_dump(mode="json")


def _value(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    return value
