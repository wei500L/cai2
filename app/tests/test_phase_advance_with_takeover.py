from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import make_repositories
from app.services.phase_service import ACTION_DURATION_MS, RESOLVE_DURATION_MS, PhaseService


def _player(player_id: str, faction_id: FactionId, *, takeover: bool = False) -> Player:
    return Player(
        id=player_id,
        room_id="room-1",
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=faction_id,
        connected=not takeover,
        joined_at_ms=1000,
        ready=True,
        ai_takeover=takeover,
        disconnected_at_ms=2000 if takeover else None,
    )


def _turn() -> EpochTurn:
    return EpochTurn(
        epoch=1,
        turn=1,
        phase=GamePhase.action,
        arbitrate_phase=None,
        phase_started_at_ms=1000,
        phase_duration_ms=ACTION_DURATION_MS,
    )


@pytest.mark.asyncio
async def test_takeover_human_is_treated_as_locked_for_phase_advance() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(3000)
    active = _player("p1", FactionId.ironCrown)
    takeover = _player("p2", FactionId.starlight, takeover=True)
    room = GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1000,
        mode="multi_4v4",
        max_players=4,
        players=[active, takeover],
        ai_factions=[],
        current=_turn(),
        seed=42,
    )
    await repos.rooms.create(room)
    await repos.players.upsert(active)
    await repos.players.upsert(takeover)
    await repos.state.save_current_turn(room.id, room.current)
    service = PhaseService(repos, clock)

    locked = await service.lock_action(room.id, active.id)
    advanced = await service.maybe_advance_by_lock(room.id)

    assert locked is True
    assert advanced.phase == GamePhase.resolve
    assert advanced.phase_duration_ms == RESOLVE_DURATION_MS
