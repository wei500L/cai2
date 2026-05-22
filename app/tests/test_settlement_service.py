from __future__ import annotations

import ast
import importlib
from pathlib import Path
from typing import Any

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    TreatyKind,
    VisibilityScope,
)
from app.domain.factions import all_faction_ids
from app.domain.models import (
    EpochTurn,
    GameAction,
    GameRoom,
    IntelAction,
    MessageVisibility,
    MilitaryAction,
    Player,
    PrivateMessageAction,
    SpeechAction,
    TreatyAction,
)
from app.game.initializer import initialize_game_state
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.client import LLMRequest, LLMResponse
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import Repositories, make_repositories
from app.services.phase_service import ACTION_DURATION_MS, PhaseService
from app.services.settlement_service import SettlementOutboundBundle, SettlementService


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(80_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


def _service(
    repos: Repositories,
    clock: FrozenClock,
    *,
    llm_client: Any | None = None,
    seed: int = 123,
) -> SettlementService:
    return SettlementService(
        repos=repos,
        clock=clock,
        aggregator=SettlementAggregator(repos, clock),
        prompt_builder=PromptBuilder(),
        llm_client=llm_client or MockLLMClient(deterministic_output=_model_output()),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=seed),
    )


def _player() -> Player:
    return Player(
        id="player-1",
        room_id="room-1",
        display_name="player-1",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1_000,
        ready=True,
    )


def _room(player: Player) -> GameRoom:
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[
            faction_id for faction_id in all_faction_ids() if faction_id != player.faction_id
        ],
        current=EpochTurn(
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=70_000,
            phase_duration_ms=ACTION_DURATION_MS,
        ),
        seed=42,
    )


async def _seed_room_state(repos: Repositories, clock: FrozenClock) -> GameRoom:
    player = _player()
    room = _room(player)
    initial = initialize_game_state(room, clock=clock)

    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_factions(room.id, initial.factions)
    await repos.state.save_relationships(room.id, initial.relationships)
    await repos.state.save_regions(room.id, initial.regions)
    await repos.state.save_treaties(room.id, initial.treaties)
    await repos.state.save_current_turn(room.id, room.current)
    return room


def _visibility(
    scope: VisibilityScope = VisibilityScope.public,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


def _base_payload(
    *,
    action_id: str,
    actor_faction: FactionId = FactionId.ironCrown,
    created_at_ms: int = 80_000,
) -> dict[str, Any]:
    return {
        "id": action_id,
        "room_id": "room-1",
        "epoch": 1,
        "turn": 2,
        "phase": GamePhase.action,
        "actor_player_id": "player-1",
        "actor_faction": actor_faction,
        "created_at_ms": created_at_ms,
    }


def _speech() -> SpeechAction:
    return SpeechAction(
        **_base_payload(action_id="speech-1"),
        visibility=_visibility(),
        mode="speech",
        content="Iron Crown promises order and tribute.",
        targets=[FactionId.starlight],
    )


def _private() -> PrivateMessageAction:
    return PrivateMessageAction(
        **_base_payload(action_id="private-1"),
        visibility=_visibility(
            VisibilityScope.faction_pair,
            [FactionId.ironCrown, FactionId.starlight],
        ),
        mode="private",
        content="Accept trade publicly while we secure the pass.",
        target_faction=FactionId.starlight,
    )


def _treaty() -> TreatyAction:
    return TreatyAction(
        **_base_payload(action_id="treaty-1"),
        visibility=_visibility(
            VisibilityScope.faction_set,
            [FactionId.ironCrown, FactionId.starlight],
        ),
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight],
        proposal_text="Open protected trade lanes.",
    )


def _military() -> MilitaryAction:
    return MilitaryAction(
        **_base_payload(action_id="military-1"),
        visibility=_visibility(VisibilityScope.self, [FactionId.ironCrown]),
        mode="military",
        source_region="region_00",
        target_region="region_01",
        movement="attack",
        orders_text="Probe the nearest Starlight border garrison.",
        troops=20,
    )


def _intel() -> IntelAction:
    return IntelAction(
        **_base_payload(action_id="intel-1"),
        visibility=_visibility(VisibilityScope.self, [FactionId.ironCrown]),
        mode="intel",
        target_faction=FactionId.starlight,
        intel_kind="spy",
        brief="Track Starlight mobilization near the trade road.",
    )


async def _seed_actions(repos: Repositories) -> None:
    actions: list[GameAction] = [_speech(), _private(), _treaty(), _military(), _intel()]
    for action in actions:
        await repos.actions.append(action)


def _model_output() -> dict[str, Any]:
    return {
        "relationship_deltas": [
            {
                "from_faction": "ironCrown",
                "to_faction": "starlight",
                "delta": -12.0,
                "reason": "Border attack undermined trust.",
            }
        ],
        "ai_speeches": [
            {
                "faction_id": "starlight",
                "kind": "reaction",
                "content": "星辉议会要求铁冠解释边境行动。",
                "target_faction": "ironCrown",
            }
        ],
        "treaty_decisions": [
            {
                "treaty_id": "treaty-1",
                "accepted": True,
                "reason": "Trade remains useful despite the border risk.",
                "counter_proposal": None,
            }
        ],
        "military_judgements": [],
        "culture_impacts": [
            {
                "faction_id": "ironCrown",
                "delta": 3.0,
                "reason": "The public speech reinforced imperial prestige.",
            }
        ],
        "morale_impacts": [
            {
                "faction_id": "ironCrown",
                "delta": 0.04,
                "reason": "Commanders saw the probe as initiative.",
            }
        ],
        "narrative_events": [
            {
                "kind": "custom",
                "actor": "ironCrown",
                "target": "starlight",
                "narration": "铁冠的贸易许诺与边境试探让星辉议会同时感到机会和威胁。",
            }
        ],
        "map_change_suggestions": [
            {
                "region_id": "region_01",
                "new_owner": "ironCrown",
                "reason": "The attacker holds a temporary military advantage.",
            }
        ],
        "stat_change_suggestions": [
            {
                "faction_id": "starlight",
                "military_delta": 0.0,
                "economy_delta": -2.0,
                "diplomacy_delta": 0.0,
                "culture_delta": 0.0,
                "morale_delta": -0.03,
            }
        ],
    }


class FailingLLMClient:
    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        del request
        raise RuntimeError("model unavailable")

    def name(self) -> str:
        return "failing"


@pytest.mark.asyncio
async def test_run_turn_settlement_persists_state_and_outbound_bundle(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions(repos)
    before_factions = {faction.id: faction for faction in await repos.state.get_factions(room.id)}
    before_relationships = {
        (rel.from_faction, rel.to_faction): rel
        for rel in await repos.state.get_relationships(room.id)
    }
    service = _service(repos, clock)

    bundle = await service.run_turn_settlement(room.id, 1, 2)

    assert isinstance(bundle, SettlementOutboundBundle)
    stored = await repos.settlements.get(room.id, 1, 2)
    assert stored is not None
    assert stored.narration_events
    assert stored.ai_speeches
    assert stored.treaty_decisions[0].accepted is True

    after_factions = {faction.id: faction for faction in await repos.state.get_factions(room.id)}
    iron_change = next(
        change
        for change in stored.faction_stat_changes
        if change.faction_id == FactionId.ironCrown
    )
    assert after_factions[FactionId.ironCrown].military == pytest.approx(
        iron_change.resulting_military
    )
    assert after_factions[FactionId.ironCrown].culture != before_factions[
        FactionId.ironCrown
    ].culture

    after_relationships = {
        (rel.from_faction, rel.to_faction): rel
        for rel in await repos.state.get_relationships(room.id)
    }
    rel_key = (FactionId.ironCrown, FactionId.starlight)
    expected_value = (
        before_relationships[rel_key].value
        + next(
            delta.delta
            for delta in stored.relationship_deltas
            if (delta.from_faction, delta.to_faction) == rel_key
        )
    )
    assert after_relationships[rel_key].value == pytest.approx(expected_value)

    after_regions = {region.id: region for region in await repos.state.get_regions(room.id)}
    if stored.region_changes:
        for change in stored.region_changes:
            assert after_regions[change.region_id].owner == change.new_owner

    treaties = await repos.state.get_treaties(room.id)
    assert [treaty.id for treaty in treaties] == [treaty.id for treaty in stored.created_treaties]

    assert bundle.room_id == room.id
    assert bundle.epoch == 1
    assert bundle.turn == 2
    assert bundle.seq_base == 1
    assert bundle.resolve_events
    assert {"changes", "border_updates"} <= set(bundle.resolve_map_diff)
    assert {"faction_stats", "relationship_changes"} <= set(bundle.resolve_stats_diff)
    assert bundle.ai_speech_events

    events = await repos.events.list_by_turn(room.id, 1, 2)
    kinds = [event.kind for event in events]
    assert EventKind.narration in kinds
    assert EventKind.ai_reaction in kinds


@pytest.mark.asyncio
async def test_llm_failure_uses_parser_fallback_and_returns_bundle(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions(repos)
    service = _service(repos, clock, llm_client=FailingLLMClient())

    bundle = await service.run_turn_settlement(room.id, 1, 2)

    stored = await repos.settlements.get(room.id, 1, 2)
    assert stored is not None
    assert stored.narration_events[0].narration.startswith("裁决系统暂未响应")
    assert bundle.resolve_events[0]["narration"].startswith("裁决系统暂未响应")


@pytest.mark.asyncio
async def test_same_seed_input_and_mock_output_are_deterministic(clock: FrozenClock) -> None:
    first_repos = make_repositories("memory")
    second_repos = make_repositories("memory")
    first_room = await _seed_room_state(first_repos, clock)
    await _seed_actions(first_repos)
    clock.set_ms(80_000)
    second_room = await _seed_room_state(second_repos, clock)
    await _seed_actions(second_repos)

    first_bundle = await _service(first_repos, clock, seed=777).run_turn_settlement(
        first_room.id,
        1,
        2,
    )
    clock.set_ms(80_000)
    second_bundle = await _service(second_repos, clock, seed=777).run_turn_settlement(
        second_room.id,
        1,
        2,
    )

    assert first_bundle.model_dump(exclude={"seq_base"}) == second_bundle.model_dump(
        exclude={"seq_base"}
    )
    first_result = await first_repos.settlements.get(first_room.id, 1, 2)
    second_result = await second_repos.settlements.get(second_room.id, 1, 2)
    assert first_result is not None
    assert second_result is not None
    assert first_result.model_dump() == second_result.model_dump()


@pytest.mark.asyncio
async def test_phase_service_only_triggers_settlement_when_entering_resolve(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    calls: list[tuple[str, int, int]] = []

    async def on_settlement_required(room_id: str, epoch: int, turn: int) -> None:
        calls.append((room_id, epoch, turn))

    service = PhaseService(repos, clock, on_settlement_required=on_settlement_required)

    await service.advance_phase(room.id)
    assert calls == [(room.id, 1, 2)]

    await service.advance_phase(room.id)
    assert calls == [(room.id, 1, 2)]


def test_settlement_service_import_boundaries() -> None:
    source_path = Path(__file__).parents[1] / "services" / "settlement_service.py"
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported_modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported_modules.append(node.module)

    assert not any(
        module == prefix or module.startswith(f"{prefix}.")
        for module in imported_modules
        for prefix in ("app.api", "app.protocol")
    )

    module = importlib.import_module("app.services.settlement_service")
    assert hasattr(module, "SettlementService")
