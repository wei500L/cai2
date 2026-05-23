from __future__ import annotations

import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    VisibilityScope,
)
from app.domain.models import EpochTurn, GameEvent, GameRoom, MessageVisibility, Player
from app.repositories.factory import make_repositories


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


def _room() -> GameRoom:
    player = Player(
        id="player-1",
        room_id="room-1",
        display_name="player-1",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1_000,
        ready=True,
    )
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[FactionId.starlight],
        current=EpochTurn(
            epoch=1,
            turn=1,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=1_000,
            phase_duration_ms=1_000,
        ),
        seed=42,
    )


def _event() -> GameEvent:
    return GameEvent(
        id="event-1",
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.resolve,
        created_at_ms=2_000,
        priority=EventPriority.P1,
        kind=EventKind.speech,
        actor_faction=FactionId.ironCrown,
        target_faction=None,
        payload={
            "internal_thought": "secret",
            "content": "hello",
        },
        narration="hello",
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


@pytest.mark.asyncio
async def test_dispatcher_strips_internal_thought_from_runtime_events() -> None:
    repos = make_repositories("memory")
    room = _room()
    await repos.rooms.create(room)
    await repos.players.upsert(room.players[0])

    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", room.id)

    dispatcher = OutboundDispatcher(manager, repos)
    await dispatcher.dispatch_to_room(
        room.id,
        {
            "v": 1,
            "id": "msg-1",
            "t": "ai.speak",
            "ts": 1,
            "seq": 1,
            "p": {
                "room_id": room.id,
                "event": _event().model_dump(mode="json"),
            },
        },
    )

    assert len(socket.sent_texts) == 1
    dumped = json.loads(socket.sent_texts[0])
    assert "internal_thought" not in dumped["p"]["event"]["payload"]
