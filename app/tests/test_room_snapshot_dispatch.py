from __future__ import annotations

import json
from typing import Any

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.api.websocket.router import InboundRouter
from app.core.clock import FrozenClock
from app.repositories.factory import Repositories, make_repositories
from app.services.action_service import ActionService
from app.services.phase_service import PhaseService
from app.services.room_service import RoomService


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


def _raw(message_type: str, payload: dict[str, Any], msg_id: str) -> dict[str, Any]:
    return {"v": 1, "id": msg_id, "t": message_type, "ts": 1, "seq": 1, "p": payload}


def _snapshot_messages(socket: FakeSocket) -> list[dict[str, Any]]:
    return [
        json.loads(text)
        for text in socket.sent_texts
        if json.loads(text)["t"] == "room.snapshot"
    ]


def _messages(socket: FakeSocket) -> list[dict[str, Any]]:
    return [json.loads(text) for text in socket.sent_texts]


@pytest.mark.asyncio
async def test_room_mutations_dispatch_room_snapshot_once_per_state_change() -> None:
    repos: Repositories = make_repositories("memory")
    clock = FrozenClock(1000)
    manager = ConnectionManager()
    socket_1 = FakeSocket()
    socket_2 = FakeSocket()
    await manager.register("p1", socket_1)
    await manager.register("p2", socket_2)
    dispatcher = OutboundDispatcher(manager, repos)
    router = InboundRouter(
        room_service=RoomService(repos, clock),
        action_service=ActionService(repos, clock),
        phase_service=PhaseService(repos, clock),
        settlement_service=None,
        repos=repos,
        clock=clock,
        connection_manager=manager,
        dispatcher=dispatcher,
    )

    created = await router.handle_raw(
        "p1",
        _raw("room.create", {"mode": "multi_4v4", "display_name": "host", "seed": 42}, "create"),
    )
    assert created is not None
    room_id = created["p"]["room_id"]
    assert len(_snapshot_messages(socket_1)) == 1
    assert any(message["t"] == "room.factions_meta" for message in _messages(socket_1))

    socket_1.sent_texts.clear()
    joined = await router.handle_raw(
        "p2",
        _raw("room.join", {"room_id": room_id, "display_name": "p2"}, "join"),
    )
    assert joined is not None
    assert [len(_snapshot_messages(socket)) for socket in (socket_1, socket_2)] == [1, 1]

    socket_1.sent_texts.clear()
    socket_2.sent_texts.clear()
    await router.handle_raw(
        "p2",
        _raw("room.select_faction", {"room_id": room_id, "faction_id": "starlight"}, "select"),
    )
    assert [len(_snapshot_messages(socket)) for socket in (socket_1, socket_2)] == [1, 1]
    latest = _snapshot_messages(socket_2)[0]
    assert latest["p"]["players"][1]["faction_id"] == "starlight"

    socket_1.sent_texts.clear()
    socket_2.sent_texts.clear()
    await router.handle_raw(
        "p2",
        _raw("room.ready", {"room_id": room_id, "ready": True}, "ready"),
    )
    assert [len(_snapshot_messages(socket)) for socket in (socket_1, socket_2)] == [1, 1]
    latest = _snapshot_messages(socket_2)[0]
    assert latest["p"]["players"][1]["ready"] is True

    socket_1.sent_texts.clear()
    socket_2.sent_texts.clear()
    await router.handle_raw("p2", _raw("room.leave", {"room_id": room_id}, "leave"))
    assert len(_snapshot_messages(socket_1)) == 1
    assert len(_snapshot_messages(socket_2)) == 0


@pytest.mark.asyncio
async def test_ws_room_start_dispatches_initial_state_meta_and_geometry() -> None:
    repos: Repositories = make_repositories("memory")
    clock = FrozenClock(1000)
    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("p1", socket)
    dispatcher = OutboundDispatcher(manager, repos)
    router = InboundRouter(
        room_service=RoomService(repos, clock),
        action_service=ActionService(repos, clock),
        phase_service=PhaseService(repos, clock),
        settlement_service=None,
        repos=repos,
        clock=clock,
        connection_manager=manager,
        dispatcher=dispatcher,
    )

    created = await router.handle_raw(
        "p1",
        _raw("room.create", {"mode": "solo_1v7", "display_name": "host", "seed": 42}, "create"),
    )
    assert created is not None
    room_id = created["p"]["room_id"]

    socket.sent_texts.clear()
    await router.handle_raw(
        "p1",
        _raw("room.select_faction", {"room_id": room_id, "faction_id": "ironCrown"}, "select"),
    )
    await router.handle_raw("p1", _raw("room.ready", {"room_id": room_id, "ready": True}, "ready"))
    socket.sent_texts.clear()

    started = await router.handle_raw("p1", _raw("room.start", {"room_id": room_id}, "start"))

    assert started is None
    messages = _messages(socket)
    assert [message["t"] for message in messages[:4]] == [
        "room.start",
        "room.factions_meta",
        "room.world_geometry",
        "room.snapshot",
    ]
    assert len(messages[1]["p"]["factions"]) == 8
    assert messages[1]["p"]["factions"][0]["primary"] == "#8B1A1A"
    assert messages[2]["p"]["total_cells"] > 0
    assert messages[3]["p"]["status"] == "running"
