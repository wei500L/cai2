from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    ArbitratePhase,
    EventKind,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
)
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.phase_service import (
    ACTION_DURATION_MS,
    ARBITRATE_BATTLE_DURATION_MS,
    ARBITRATE_EPIC_DURATION_MS,
    ARBITRATE_SUMMARY_DURATION_MS,
    OBSERVE_DURATION_MS,
    RESOLVE_DURATION_MS,
    PhaseService,
)


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(10_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


@pytest.fixture()
def service(repos: Repositories, clock: FrozenClock) -> PhaseService:
    return PhaseService(repos, clock)


def _player(
    player_id: str,
    *,
    room_id: str = "room-1",
    kind: PlayerKind = PlayerKind.human,
    faction_id: FactionId = FactionId.ironCrown,
) -> Player:
    return Player(
        id=player_id,
        room_id=room_id,
        display_name=player_id,
        kind=kind,
        faction_id=faction_id,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


def _turn(
    *,
    epoch: int = 1,
    turn: int = 1,
    phase: GamePhase = GamePhase.observe,
    arbitrate_phase: ArbitratePhase | None = None,
    started_at_ms: int = 10_000,
    duration_ms: int = OBSERVE_DURATION_MS,
) -> EpochTurn:
    return EpochTurn(
        epoch=epoch,
        turn=turn,
        phase=phase,
        arbitrate_phase=arbitrate_phase,
        phase_started_at_ms=started_at_ms,
        phase_duration_ms=duration_ms,
    )


def _room(
    *,
    room_id: str = "room-1",
    players: list[Player] | None = None,
    current: EpochTurn | None = None,
    status: RoomStatus = RoomStatus.running,
) -> GameRoom:
    players = players or [_player("player-1", room_id=room_id)]
    selected = {player.faction_id for player in players if player.faction_id is not None}
    return GameRoom(
        id=room_id,
        status=status,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=len([player for player in players if player.kind == PlayerKind.human]),
        players=players,
        ai_factions=[faction_id for faction_id in FactionId if faction_id not in selected],
        current=current or _turn(),
        seed=42,
    )


async def _seed_room(
    repos: Repositories,
    *,
    current: EpochTurn | None = None,
    players: list[Player] | None = None,
    status: RoomStatus = RoomStatus.running,
) -> GameRoom:
    room = _room(players=players, current=current, status=status)
    await repos.rooms.create(room)
    for player in room.players:
        await repos.players.upsert(player)
    await repos.state.save_current_turn(room.id, room.current)
    return room


async def _advance_sequence(service: PhaseService, room_id: str, count: int) -> list[EpochTurn]:
    turns = []
    for _ in range(count):
        turns.append(await service.advance_phase(room_id))
    return turns


@pytest.mark.asyncio
async def test_begin_turn_writes_observe_and_phase_change_event(
    repos: Repositories,
    service: PhaseService,
) -> None:
    room = await _seed_room(repos, current=_turn(epoch=0, turn=0, duration_ms=0))

    current = await service.begin_turn(room.id, epoch=1, turn=1)

    assert current == EpochTurn(
        epoch=1,
        turn=1,
        phase=GamePhase.observe,
        arbitrate_phase=None,
        phase_started_at_ms=10_000,
        phase_duration_ms=OBSERVE_DURATION_MS,
    )
    assert await repos.state.get_current_turn(room.id) == current
    stored_room = await repos.rooms.get(room.id)
    assert stored_room is not None
    assert stored_room.current == current

    events = await repos.events.list_all(room.id)
    assert len(events) == 1
    assert events[0].kind == EventKind.phase_change
    assert events[0].payload["new_phase"] == "observe"
    assert events[0].payload["epoch"] == 1
    assert events[0].payload["turn"] == 1
    assert events[0].payload["turn_begin"] == {
        "room_id": room.id,
        "epoch": 1,
        "turn": 1,
        "phase": "observe",
        "phase_duration_ms": OBSERVE_DURATION_MS,
        "phase_started_at_ms": 10_000,
    }


@pytest.mark.asyncio
async def test_advance_phase_observe_action_resolve_next_turn_observe(
    repos: Repositories,
    service: PhaseService,
) -> None:
    room = await _seed_room(repos, current=_turn(epoch=1, turn=1))

    action, resolve, next_observe = await _advance_sequence(service, room.id, 3)

    assert action.phase == GamePhase.action
    assert action.phase_duration_ms == ACTION_DURATION_MS
    assert (action.epoch, action.turn) == (1, 1)

    assert resolve.phase == GamePhase.resolve
    assert resolve.phase_duration_ms == RESOLVE_DURATION_MS
    assert (resolve.epoch, resolve.turn) == (1, 1)

    assert next_observe.phase == GamePhase.observe
    assert next_observe.arbitrate_phase is None
    assert next_observe.phase_duration_ms == OBSERVE_DURATION_MS
    assert (next_observe.epoch, next_observe.turn) == (1, 2)


@pytest.mark.asyncio
async def test_turn_three_resolve_enters_arbitrate_chain_then_next_epoch(
    repos: Repositories,
    service: PhaseService,
) -> None:
    room = await _seed_room(
        repos,
        current=_turn(
            epoch=1,
            turn=3,
            phase=GamePhase.resolve,
            started_at_ms=10_000,
            duration_ms=RESOLVE_DURATION_MS,
        ),
    )

    battle, epic, summary, next_epoch = await _advance_sequence(service, room.id, 4)

    assert battle.phase == GamePhase.arbitrate
    assert battle.arbitrate_phase == ArbitratePhase.battle
    assert battle.phase_duration_ms == ARBITRATE_BATTLE_DURATION_MS
    assert (battle.epoch, battle.turn) == (1, 3)

    assert epic.phase == GamePhase.arbitrate
    assert epic.arbitrate_phase == ArbitratePhase.epic
    assert epic.phase_duration_ms == ARBITRATE_EPIC_DURATION_MS

    assert summary.phase == GamePhase.arbitrate
    assert summary.arbitrate_phase == ArbitratePhase.summary
    assert summary.phase_duration_ms == ARBITRATE_SUMMARY_DURATION_MS

    assert next_epoch.phase == GamePhase.observe
    assert next_epoch.arbitrate_phase is None
    assert next_epoch.phase_duration_ms == OBSERVE_DURATION_MS
    assert (next_epoch.epoch, next_epoch.turn) == (2, 1)


@pytest.mark.asyncio
async def test_epoch_eight_summary_finishes_room(
    repos: Repositories,
    service: PhaseService,
) -> None:
    room = await _seed_room(
        repos,
        current=_turn(
            epoch=8,
            turn=3,
            phase=GamePhase.arbitrate,
            arbitrate_phase=ArbitratePhase.summary,
            duration_ms=ARBITRATE_SUMMARY_DURATION_MS,
        ),
    )

    current = await service.advance_phase(room.id)

    assert current.phase == GamePhase.arbitrate
    assert current.arbitrate_phase == ArbitratePhase.summary
    stored_room = await repos.rooms.get(room.id)
    assert stored_room is not None
    assert stored_room.status == RoomStatus.finished
    events = await repos.events.list_all(room.id)
    assert events[-1].kind == EventKind.phase_change
    assert events[-1].payload["new_phase"] == "finished"


@pytest.mark.asyncio
async def test_maybe_advance_by_clock_waits_until_duration_elapses(
    repos: Repositories,
    service: PhaseService,
    clock: FrozenClock,
) -> None:
    room = await _seed_room(repos, current=_turn(started_at_ms=10_000))

    clock.advance_ms(OBSERVE_DURATION_MS - 1)
    unchanged = await service.maybe_advance_by_clock(room.id)
    assert unchanged.phase == GamePhase.observe

    clock.advance_ms(1)
    advanced = await service.maybe_advance_by_clock(room.id)
    assert advanced.phase == GamePhase.action
    assert advanced.phase_duration_ms == ACTION_DURATION_MS


@pytest.mark.asyncio
async def test_lock_action_single_player_waits_all_humans_then_advances_by_lock(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    players = [
        _player("player-1", faction_id=FactionId.ironCrown),
        _player("player-2", faction_id=FactionId.starlight),
        _player("ai-1", kind=PlayerKind.ai, faction_id=FactionId.emerald),
    ]
    room = await _seed_room(
        repos,
        players=players,
        current=_turn(phase=GamePhase.action, duration_ms=ACTION_DURATION_MS),
    )
    service = PhaseService(repos, clock)

    assert await service.lock_action(room.id, "player-1") is False
    unchanged = await service.maybe_advance_by_lock(room.id)
    assert unchanged.phase == GamePhase.action

    assert await service.lock_action(room.id, "player-2") is True
    advanced = await service.maybe_advance_by_lock(room.id)
    assert advanced.phase == GamePhase.resolve
    assert advanced.phase_duration_ms == RESOLVE_DURATION_MS


@pytest.mark.asyncio
async def test_on_settlement_required_called_once_when_entering_resolve(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    calls: list[tuple[str, int, int]] = []

    async def on_settlement_required(room_id: str, epoch: int, turn: int) -> None:
        calls.append((room_id, epoch, turn))

    room = await _seed_room(
        repos,
        current=_turn(phase=GamePhase.action, duration_ms=ACTION_DURATION_MS),
    )
    service = PhaseService(repos, clock, on_settlement_required=on_settlement_required)

    await service.advance_phase(room.id)
    await service.advance_phase(room.id)

    assert calls == [(room.id, 1, 1)]


@pytest.mark.asyncio
async def test_force_phase_debug_only_can_jump_to_arbitrate_summary(
    repos: Repositories,
    service: PhaseService,
) -> None:
    room = await _seed_room(repos, current=_turn(epoch=2, turn=3))

    forced = await service.force_phase(
        room.id,
        phase=GamePhase.arbitrate,
        arbitrate_phase=ArbitratePhase.summary,
    )

    assert forced.phase == GamePhase.arbitrate
    assert forced.arbitrate_phase == ArbitratePhase.summary
    assert forced.phase_duration_ms == ARBITRATE_SUMMARY_DURATION_MS
    events = await repos.events.list_all(room.id)
    assert events[-1].payload["debug_forced"] is True
