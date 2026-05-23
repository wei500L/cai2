from __future__ import annotations

import pytest

from app.api.websocket.router import _build_reconnect_payload
from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    VisibilityScope,
)
from app.domain.factions import all_faction_ids
from app.domain.models import EpochTurn, GameEvent, GameRoom, MessageVisibility, Player
from app.game.globe_geometry import generate_world_geometry
from app.game.initializer import initialize_game_state
from app.repositories.factory import make_repositories


def _room() -> GameRoom:
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[],
        ai_factions=[faction for faction in all_faction_ids() if faction != FactionId.ironCrown],
        current=EpochTurn(
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=9_000,
            phase_duration_ms=30_000,
        ),
        seed=42,
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


def _event(index: int) -> GameEvent:
    return GameEvent(
        id=f"event-{index}",
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        created_at_ms=10_000 + index,
        priority=EventPriority.P2,
        kind=EventKind.speech,
        actor_faction=FactionId.ironCrown,
        target_faction=None,
        payload={"index": index},
        narration=f"event {index}",
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


@pytest.mark.asyncio
async def test_reconnect_uses_snapshot_when_gap_exceeds_threshold() -> None:
    clock = FrozenClock(12_345)
    repos = make_repositories("memory")
    room = _room()
    player = _player()
    room.world_geometry = generate_world_geometry(room.seed, faction_ids=list(all_faction_ids()))
    state = initialize_game_state(room, clock=clock)

    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_factions(room.id, state.factions)
    await repos.state.save_regions(room.id, state.regions)
    await repos.state.save_relationships(room.id, state.relationships)
    await repos.state.save_treaties(room.id, state.treaties)
    await repos.state.save_current_turn(room.id, room.current)

    for index in range(51):
        await repos.events.append(_event(index))

    payload = await _build_reconnect_payload(
        repos=repos,
        clock=clock,
        room_id=room.id,
        player_id=player.id,
        last_seq=0,
    )

    assert payload["t"] == "reconnect.snapshot"
    assert payload["p"]["world_geometry"]["total_cells"] == 642
    assert set(payload["p"]["full_state"]) >= {
        "room",
        "current_turn",
        "factions",
        "regions",
        "world_geometry",
        "relationships",
        "treaties",
        "recent_events",
        "recent_messages",
        "ai_thinking_state",
        "border_tension",
        "winner",
        "final_narration",
    }
