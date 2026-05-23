from __future__ import annotations

import asyncio
import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import FrozenClock
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.takeover_service import TakeoverService


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


def _turn() -> EpochTurn:
    return EpochTurn(
        epoch=1,
        turn=1,
        phase=GamePhase.action,
        arbitrate_phase=None,
        phase_started_at_ms=1000,
        phase_duration_ms=90_000,
    )


def _player(player_id: str, faction_id: FactionId) -> Player:
    return Player(
        id=player_id,
        room_id="room-1",
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=faction_id,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


async def _seed_room(repos: Repositories) -> tuple[GameRoom, Player, Player]:
    first = _player("p1", FactionId.ironCrown)
    second = _player("p2", FactionId.starlight)
    room = GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1000,
        mode="multi_4v4",
        max_players=4,
        players=[first, second],
        ai_factions=[FactionId.emerald, FactionId.ashen, FactionId.aurora, FactionId.darkTide],
        current=_turn(),
        seed=42,
    )
    await repos.rooms.create(room)
    await repos.players.upsert(first)
    await repos.players.upsert(second)
    return room, first, second


async def _seed_service(*, takeover_after_s: float = 0.01):
    repos = make_repositories("memory")
    clock = FrozenClock(2000)
    manager = ConnectionManager()
    observer_socket = FakeSocket()
    disconnected_socket = FakeSocket()
    await _seed_room(repos)
    await manager.register("p1", disconnected_socket)
    await manager.register("p2", observer_socket)
    await manager.attach_to_room("p1", "room-1")
    await manager.attach_to_room("p2", "room-1")
    dispatcher = OutboundDispatcher(manager, repos)
    service = TakeoverService(
        repos,
        clock,
        dispatcher,
        takeover_after_s=takeover_after_s,
        permanent_after_s=takeover_after_s * 2,
    )
    return service, repos, manager, observer_socket


@pytest.mark.asyncio
async def test_disconnect_marks_ai_takeover_after_delay() -> None:
    service, repos, manager, observer_socket = await _seed_service()
    await manager.unregister("p1")

    await service.on_disconnect("room-1", "p1")
    await asyncio.sleep(0.03)

    player = await repos.players.get("p1")
    assert player is not None
    assert player.connected is False
    assert player.ai_takeover is True
    message_types = [json.loads(text)["t"] for text in observer_socket.sent_texts]
    assert "room.player_takeover" in message_types
    assert message_types.count("room.player_takeover") == 1


@pytest.mark.asyncio
async def test_reconnect_before_delay_cancels_takeover_task() -> None:
    service, repos, manager, observer_socket = await _seed_service()
    await manager.unregister("p1")

    await service.on_disconnect("room-1", "p1")
    await manager.register("p1", FakeSocket())
    await manager.attach_to_room("p1", "room-1")
    await service.on_reconnect("room-1", "p1")
    await asyncio.sleep(0.03)

    player = await repos.players.get("p1")
    assert player is not None
    assert player.connected is True
    assert player.ai_takeover is False
    message_types = [json.loads(text)["t"] for text in observer_socket.sent_texts]
    assert "room.player_takeover" not in message_types


@pytest.mark.asyncio
async def test_manual_leave_triggers_takeover_immediately() -> None:
    service, repos, _manager, observer_socket = await _seed_service(takeover_after_s=0.05)

    await service.on_manual_leave("room-1", "p1")

    player = await repos.players.get("p1")
    assert player is not None
    assert player.connected is False
    assert player.ai_takeover is True
    takeover = [
        json.loads(text)
        for text in observer_socket.sent_texts
        if json.loads(text)["t"] == "room.player_takeover"
    ]
    assert takeover[0]["p"]["reason"] == "manual_leave"
