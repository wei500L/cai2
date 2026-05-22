from __future__ import annotations

import ast
import importlib
import importlib.abc
import sys
from pathlib import Path
from typing import Any, Literal

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    PlayerKind,
    RelationshipStatus,
    RoomStatus,
    TreatyKind,
    VisibilityScope,
)
from app.domain.factions import all_faction_ids
from app.domain.models import (
    EpochTurn,
    FactionState,
    GameAction,
    GameEvent,
    GameRoom,
    IntelAction,
    MapRegion,
    MessageVisibility,
    MilitaryAction,
    Player,
    PrivateMessageAction,
    Relationship,
    SpeechAction,
    TreatyAction,
)
from app.game.initializer import initialize_game_state
from app.game.settlement_aggregator import (
    SettlementAggregator,
    SettlementInput,
    format_faction_stats_line,
    format_relationship_line,
    split_actions_by_mode,
)
from app.repositories.factory import Repositories, make_repositories


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(50_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


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
        ai_factions=[faction_id for faction_id in all_faction_ids() if faction_id != player.faction_id],
        current=EpochTurn(
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=45_000,
            phase_duration_ms=30_000,
        ),
        seed=42,
    )


async def _seed_room_state(repos: Repositories, clock: FrozenClock) -> GameRoom:
    player = _player()
    room = _room(player)
    initial = initialize_game_state(room, clock=clock)
    current = room.current

    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_factions(room.id, initial.factions)
    await repos.state.save_relationships(room.id, initial.relationships)
    await repos.state.save_regions(room.id, initial.regions)
    await repos.state.save_treaties(room.id, initial.treaties)
    await repos.state.save_current_turn(room.id, current)
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
    created_at_ms: int = 50_000,
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


def _speech(index: int) -> SpeechAction:
    return SpeechAction(
        **_base_payload(action_id=f"speech-{index}"),
        visibility=_visibility(),
        mode="speech",
        content=f"public speech {index}",
        targets=[FactionId.starlight],
    )


def _private(index: int) -> PrivateMessageAction:
    return PrivateMessageAction(
        **_base_payload(action_id=f"private-{index}"),
        visibility=_visibility(VisibilityScope.faction_pair, [FactionId.ironCrown, FactionId.starlight]),
        mode="private",
        content=f"private message {index}",
        target_faction=FactionId.starlight,
    )


def _treaty(index: int) -> TreatyAction:
    return TreatyAction(
        **_base_payload(action_id=f"treaty-{index}"),
        visibility=_visibility(VisibilityScope.faction_set, [FactionId.ironCrown, FactionId.starlight]),
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight],
        proposal_text=f"trade proposal {index}",
    )


def _military(index: int) -> MilitaryAction:
    return MilitaryAction(
        **_base_payload(action_id=f"military-{index}"),
        visibility=_visibility(VisibilityScope.self, [FactionId.ironCrown]),
        mode="military",
        source_region="region_00",
        target_region="region_01",
        movement="attack",
        orders_text=f"advance {index}",
        troops=10 + index,
    )


def _intel(index: int) -> IntelAction:
    return IntelAction(
        **_base_payload(action_id=f"intel-{index}"),
        visibility=_visibility(VisibilityScope.self, [FactionId.ironCrown]),
        mode="intel",
        target_faction=FactionId.starlight,
        intel_kind="spy",
        brief=f"watch border {index}",
    )


def _turn_actions() -> list[GameAction]:
    return [
        *(_speech(index) for index in range(5)),
        *(_private(index) for index in range(2)),
        _treaty(0),
        *(_military(index) for index in range(3)),
        _intel(0),
    ]


def _event(
    event_id: str,
    *,
    turn: int,
    created_at_ms: int,
    narration: str | None = None,
) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        epoch=1,
        turn=turn,
        phase=GamePhase.resolve,
        created_at_ms=created_at_ms,
        priority=EventPriority.P1,
        kind=EventKind.narration,
        actor_faction=None,
        target_faction=None,
        payload={"event_id": event_id},
        narration=narration or event_id,
        visibility=_visibility(),
    )


async def _seed_actions_and_events(repos: Repositories) -> None:
    for action in _turn_actions():
        await repos.actions.append(action)

    for index in range(18):
        await repos.events.append(
            _event(f"prev-{index}", turn=1, created_at_ms=10_000 + index)
        )
    for index in range(18):
        await repos.events.append(
            _event(f"current-{index}", turn=2, created_at_ms=20_000 + index)
        )


@pytest.mark.asyncio
async def test_aggregate_builds_settlement_input_buckets_and_snapshots(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions_and_events(repos)
    aggregator = SettlementAggregator(repos, clock)

    result = await aggregator.aggregate(room.id, 1, 2)

    assert isinstance(result, SettlementInput)
    assert len(result.turn_actions) == 12
    assert len(result.public_speeches) == 5
    assert len(result.private_messages) == 2
    assert len(result.treaty_requests) == 1
    assert len(result.military_orders) == 3
    assert len(result.intel_actions) == 1

    assert len(result.factions_snapshot) == 8
    assert len(result.relationships_snapshot) == 56
    assert len(result.regions_snapshot) == 64
    assert result.treaties_snapshot == []

    assert len(result.recent_events) <= 20
    assert [event.created_at_ms for event in result.recent_events] == sorted(
        [event.created_at_ms for event in result.recent_events],
        reverse=True,
    )
    assert result.recent_events[0].id == "current-17"

    personality = result.faction_personality_summary[FactionId.ironCrown]
    assert personality["archetype"]
    assert personality["trigger_words"] == ["臣服", "投降", "弱者"]
    assert "aggression" in personality
    assert "trust_base" in personality
    assert "honor_code" in personality

    assert "ironCrown ->" in result.relationship_summary_text
    assert "faction | military" in result.faction_stats_summary_text
    assert "ironCrown |" in result.faction_stats_summary_text

    validated = SettlementInput.model_validate(result.model_dump())
    assert validated == result


@pytest.mark.asyncio
async def test_aggregate_is_repeatable_for_same_turn_except_timestamp(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions_and_events(repos)
    aggregator = SettlementAggregator(repos, clock)

    first = await aggregator.aggregate(room.id, 1, 2)
    clock.set_ms(51_000)
    second = await aggregator.aggregate(room.id, 1, 2)

    assert first.generated_at_ms == 50_000
    assert second.generated_at_ms == 51_000
    assert first.model_dump(exclude={"generated_at_ms"}) == second.model_dump(
        exclude={"generated_at_ms"}
    )


@pytest.mark.asyncio
async def test_aggregate_does_not_modify_repository_data(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions_and_events(repos)
    aggregator = SettlementAggregator(repos, clock)

    before = await _repository_snapshot(repos, room.id)
    await aggregator.aggregate(room.id, 1, 2)
    after = await _repository_snapshot(repos, room.id)

    assert after == before


@pytest.mark.asyncio
async def test_aggregate_epoch_summary_uses_epoch_last_turn_and_wide_event_window(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = await _seed_room_state(repos, clock)
    await _seed_actions_and_events(repos)
    aggregator = SettlementAggregator(repos, clock, recent_event_window=3)

    turn_input = await aggregator.aggregate(room.id, 1, 2)
    epoch_input = await aggregator.aggregate_epoch_summary(room.id, 1)

    assert turn_input.turn == 2
    assert len(turn_input.recent_events) == 3
    assert epoch_input.turn == 2
    assert len(epoch_input.recent_events) == 36


def test_split_and_format_helpers_are_readable() -> None:
    actions = _turn_actions()
    buckets = split_actions_by_mode(actions)
    faction_line = format_faction_stats_line(
        FactionState(
            id=FactionId.ironCrown,
            military=120.0,
            economy=100.0,
            diplomacy=50.0,
            culture=30.0,
            morale=1.0,
            total_power=84.5,
            status=FactionStatusKind.stable,
        )
    )
    relationship_line = format_relationship_line(
        Relationship(
            from_faction=FactionId.ironCrown,
            to_faction=FactionId.starlight,
            value=10.0,
            status=RelationshipStatus.neutral,
            treaties=[],
            last_changed_turn=1,
        )
    )

    assert len(buckets["speech"]) == 5
    assert len(buckets["private"]) == 2
    assert "ironCrown | 120.0" in faction_line
    assert "ironCrown -> starlight" in relationship_line


def test_aggregator_import_boundaries_and_no_llm_dependency() -> None:
    source_path = Path(__file__).parents[1] / "game" / "settlement_aggregator.py"
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported_modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported_modules.append(node.module)

    forbidden_prefixes = ("app.llm", "app.api", "app.protocol")
    assert not any(
        module == prefix or module.startswith(f"{prefix}.")
        for module in imported_modules
        for prefix in forbidden_prefixes
    )

    class _BlockLLMImports(importlib.abc.MetaPathFinder):
        triggered = False

        def find_spec(
            self,
            fullname: str,
            path: object | None,
            target: object | None = None,
        ) -> object | None:
            if fullname == "app.llm" or fullname.startswith("app.llm."):
                self.triggered = True
                raise AssertionError(f"LLM import attempted: {fullname}")
            return None

    finder = _BlockLLMImports()
    original_modules = {
        name: module for name, module in sys.modules.items() if name.startswith("app.llm")
    }
    for name in original_modules:
        sys.modules.pop(name, None)
    sys.meta_path.insert(0, finder)
    try:
        import app.game.settlement_aggregator as module

        importlib.reload(module)
        assert finder.triggered is False
    finally:
        sys.meta_path.remove(finder)
        sys.modules.update(original_modules)


async def _repository_snapshot(repos: Repositories, room_id: str) -> dict[str, Any]:
    current_turn = await repos.state.get_current_turn(room_id)
    return {
        "factions": [item.model_dump() for item in await repos.state.get_factions(room_id)],
        "relationships": [
            item.model_dump() for item in await repos.state.get_relationships(room_id)
        ],
        "regions": [item.model_dump() for item in await repos.state.get_regions(room_id)],
        "treaties": [item.model_dump() for item in await repos.state.get_treaties(room_id)],
        "current_turn": current_turn.model_dump() if current_turn is not None else None,
        "actions": [
            item.model_dump() for item in await repos.actions.list_by_turn(room_id, 1, 2)
        ],
        "events": [item.model_dump() for item in await repos.events.list_all(room_id)],
    }
