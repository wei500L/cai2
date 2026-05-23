from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.phase_scheduler import PhaseScheduler
from app.services.phase_service import OBSERVE_DURATION_MS, PhaseService


class FakeDispatcher:
    def __init__(self) -> None:
        self.phase_changes: list[dict[str, Any]] = []
        self.resolve_bundles: list[Any] = []
        self.ai_thinking_rooms: list[str] = []

    async def dispatch_phase_change(self, room_id: str, payload: dict[str, Any]) -> None:
        self.phase_changes.append({"room_id": room_id, "payload": payload})

    async def dispatch_resolve_bundle(self, room_id: str, bundle: Any) -> None:
        self.resolve_bundles.append({"room_id": room_id, "bundle": bundle})

    async def dispatch_ai_thinking(self, room_id: str, *, progress: float = 0.05) -> None:
        del progress
        self.ai_thinking_rooms.append(room_id)


class FakeSettlementService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, int]] = []
        self.started = asyncio.Event()

    async def run_turn_settlement(self, room_id: str, epoch: int, turn: int) -> object:
        self.calls.append((room_id, epoch, turn))
        self.started.set()
        return object()


def _player(room_id: str = "room-1") -> Player:
    return Player(
        id="player-1",
        room_id=room_id,
        display_name="player-1",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


def _turn(
    *,
    phase: GamePhase = GamePhase.observe,
    started_at_ms: int = 10_000,
    duration_ms: int = OBSERVE_DURATION_MS,
) -> EpochTurn:
    return EpochTurn(
        epoch=1,
        turn=1,
        phase=phase,
        arbitrate_phase=None,
        phase_started_at_ms=started_at_ms,
        phase_duration_ms=duration_ms,
    )


async def _seed_room(
    repos: Repositories,
    *,
    current: EpochTurn | None = None,
    status: RoomStatus = RoomStatus.running,
) -> GameRoom:
    player = _player()
    room = GameRoom(
        id="room-1",
        status=status,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[faction for faction in FactionId if faction != player.faction_id],
        current=current or _turn(),
        seed=42,
    )
    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_current_turn(room.id, room.current)
    return room


@pytest.mark.asyncio
async def test_scheduler_advances_room_by_clock_and_dispatches_phase_change() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(10_000)
    dispatcher = FakeDispatcher()
    settlement = FakeSettlementService()
    room = await _seed_room(repos)
    scheduler = PhaseScheduler(
        phase_service=PhaseService(repos, clock),
        settlement_service=settlement,
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,  # type: ignore[arg-type]
        tick_interval_s=0.01,
    )

    await scheduler.start_room(room.id)
    clock.advance_ms(OBSERVE_DURATION_MS)
    await asyncio.sleep(0.03)
    await scheduler.shutdown()

    current = await repos.state.get_current_turn(room.id)
    assert current is not None
    assert current.phase == GamePhase.action
    assert dispatcher.phase_changes[0]["payload"]["phase"] == "action"
    assert dispatcher.phase_changes[0]["payload"]["server_time_ms"] == clock.now_ms()


@pytest.mark.asyncio
async def test_scheduler_exits_when_room_is_finished() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(10_000)
    dispatcher = FakeDispatcher()
    settlement = FakeSettlementService()
    room = await _seed_room(repos)
    scheduler = PhaseScheduler(
        phase_service=PhaseService(repos, clock),
        settlement_service=settlement,
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,  # type: ignore[arg-type]
        tick_interval_s=0.01,
    )

    await scheduler.start_room(room.id)
    room.status = RoomStatus.finished
    await repos.rooms.update(room)
    await asyncio.sleep(0.03)

    assert scheduler._tasks == {}


@pytest.mark.asyncio
async def test_scheduler_triggers_settlement_fire_and_forget_on_resolve() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(10_000)
    dispatcher = FakeDispatcher()
    settlement = FakeSettlementService()
    room = await _seed_room(
        repos,
        current=_turn(phase=GamePhase.action, duration_ms=1),
    )
    scheduler = PhaseScheduler(
        phase_service=PhaseService(repos, clock),
        settlement_service=settlement,
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,  # type: ignore[arg-type]
        tick_interval_s=0.01,
    )

    await scheduler.start_room(room.id)
    clock.advance_ms(1)
    await asyncio.wait_for(settlement.started.wait(), timeout=0.2)
    await scheduler.shutdown()

    assert settlement.calls == [(room.id, 1, 1)]
    assert dispatcher.ai_thinking_rooms == [room.id]
    assert dispatcher.resolve_bundles[0]["room_id"] == room.id


@pytest.mark.asyncio
async def test_scheduler_shutdown_cancels_all_tasks() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(10_000)
    dispatcher = FakeDispatcher()
    settlement = FakeSettlementService()
    room = await _seed_room(repos)
    scheduler = PhaseScheduler(
        phase_service=PhaseService(repos, clock),
        settlement_service=settlement,
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,  # type: ignore[arg-type]
        tick_interval_s=1,
    )

    await scheduler.start_room(room.id)
    await scheduler.start_room(room.id)
    assert len(scheduler._tasks) == 1

    await scheduler.shutdown()

    assert scheduler._tasks == {}
