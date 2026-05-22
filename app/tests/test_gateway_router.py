from __future__ import annotations

import json
from typing import Any

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.api.websocket.router import InboundRouter
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
from app.domain.models import EpochTurn, GameEvent, GameRoom, MessageVisibility, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.action_service import ActionService
from app.services.phase_service import PhaseService
from app.services.room_service import RoomService


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(10_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


@pytest.fixture()
def inbound_router(repos: Repositories, clock: FrozenClock) -> InboundRouter:
    return InboundRouter(
        room_service=RoomService(repos, clock),
        action_service=ActionService(repos, clock),
        phase_service=PhaseService(repos, clock),
        settlement_service=None,
        repos=repos,
        clock=clock,
    )


def _raw(message_type: str, payload: dict[str, Any], msg_id: str = "msg-1") -> dict[str, Any]:
    return {"v": 1, "id": msg_id, "t": message_type, "ts": 1, "seq": 1, "p": payload}


def _player(
    *,
    player_id: str = "player-1",
    room_id: str = "room-1",
    faction_id: FactionId = FactionId.ironCrown,
) -> Player:
    return Player(
        id=player_id,
        room_id=room_id,
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=faction_id,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


def _turn(phase: GamePhase = GamePhase.action) -> EpochTurn:
    return EpochTurn(
        epoch=1,
        turn=1,
        phase=phase,
        arbitrate_phase=None,
        phase_started_at_ms=9000,
        phase_duration_ms=30_000,
    )


def _room(
    *,
    room_id: str = "room-1",
    player: Player | None = None,
    phase: GamePhase = GamePhase.action,
) -> GameRoom:
    player = player or _player(room_id=room_id)
    return GameRoom(
        id=room_id,
        status=RoomStatus.running,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[faction for faction in FactionId if faction != player.faction_id],
        current=_turn(phase),
        seed=42,
    )


async def _seed_running_room(
    repos: Repositories,
    *,
    phase: GamePhase = GamePhase.action,
) -> tuple[GameRoom, Player]:
    player = _player()
    room = _room(player=player, phase=phase)
    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_current_turn(room.id, room.current)
    return room, player


def _event(index: int, room_id: str = "room-1") -> GameEvent:
    return GameEvent(
        id=f"event-{index}",
        room_id=room_id,
        epoch=1,
        turn=1,
        phase=GamePhase.action,
        created_at_ms=1000 + index,
        priority=EventPriority.P2,
        kind=EventKind.speech,
        actor_faction=FactionId.ironCrown,
        target_faction=None,
        payload={"content": f"event {index}"},
        narration=f"event {index}",
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


@pytest.mark.asyncio
async def test_connection_manager_register_unregister_and_room_subscription() -> None:
    manager = ConnectionManager()
    socket = FakeSocket()

    session = await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", "room-1")

    subscribers = await manager.get_room_subscribers("room-1")
    assert session.player_id == "player-1"
    assert [item.player_id for item in subscribers] == ["player-1"]

    await manager.unregister("player-1")

    assert await manager.get_room_subscribers("room-1") == []
    stored = await manager.get_session("player-1")
    assert stored is not None
    assert stored.connected is False


@pytest.mark.asyncio
async def test_dispatcher_dispatch_to_room_honors_visibility_filter(
    repos: Repositories,
) -> None:
    manager = ConnectionManager()
    first = FakeSocket()
    second = FakeSocket()
    await manager.register("player-1", first)
    await manager.register("player-2", second)
    await manager.attach_to_room("player-1", "room-1")
    await manager.attach_to_room("player-2", "room-1")
    dispatcher = OutboundDispatcher(manager, repos)

    await dispatcher.dispatch_to_room(
        "room-1",
        {"t": "test.message", "p": {"ok": True}},
        visibility_filter=lambda session: session.player_id == "player-1",
    )

    assert len(first.sent_texts) == 1
    assert json.loads(first.sent_texts[0])["t"] == "test.message"
    assert second.sent_texts == []


@pytest.mark.asyncio
async def test_inbound_router_ping_returns_pong(inbound_router: InboundRouter) -> None:
    response = await inbound_router.handle_raw(
        "player-1",
        _raw("conn.ping", {"client_ts": 123}),
    )

    assert response is not None
    assert response["t"] == "conn.pong"
    assert response["p"]["server_ts"] == 10_000


@pytest.mark.asyncio
async def test_room_create_returns_room_created(inbound_router: InboundRouter) -> None:
    response = await inbound_router.handle_raw(
        "player-1",
        _raw(
            "room.create",
            {"mode": "solo_1v7", "display_name": "Alice", "seed": 7},
        ),
    )

    assert response is not None
    assert response["t"] == "room.created"
    assert response["p"]["mode"] == "solo_1v7"
    assert response["p"]["room_id"].startswith("room_")


@pytest.mark.asyncio
async def test_action_speak_in_action_phase_returns_action_broadcast(
    repos: Repositories,
    inbound_router: InboundRouter,
) -> None:
    room, player = await _seed_running_room(repos, phase=GamePhase.action)

    response = await inbound_router.handle_raw(
        player.id,
        _raw(
            "action.speak",
            {
                "room_id": room.id,
                "mode": "speech",
                "content": "We offer peace.",
                "targets": [FactionId.starlight],
                "metadata": None,
            },
            msg_id="req-speech",
        ),
    )

    assert response is not None
    assert response["t"] == "action.broadcast"
    assert response["p"]["event"]["request_id"] == "req-speech"
    assert response["p"]["event"]["accepted"] is True


@pytest.mark.asyncio
async def test_action_speak_in_observe_phase_returns_action_rejected(
    repos: Repositories,
    inbound_router: InboundRouter,
) -> None:
    room, player = await _seed_running_room(repos, phase=GamePhase.observe)

    response = await inbound_router.handle_raw(
        player.id,
        _raw(
            "action.speak",
            {
                "room_id": room.id,
                "mode": "speech",
                "content": "Too early.",
                "targets": [FactionId.starlight],
                "metadata": None,
            },
            msg_id="req-reject",
        ),
    )

    assert response is not None
    assert response["t"] == "action.rejected"
    assert response["p"]["request_id"] == "req-reject"
    assert response["p"]["error_code"] == "InvalidPhaseError"


@pytest.mark.asyncio
async def test_action_lock_all_humans_advances_phase_to_resolve(
    repos: Repositories,
    inbound_router: InboundRouter,
) -> None:
    room, player = await _seed_running_room(repos, phase=GamePhase.action)

    response = await inbound_router.handle_raw(
        player.id,
        _raw("action.lock", {"room_id": room.id}, msg_id="req-lock"),
    )

    current = await repos.state.get_current_turn(room.id)
    assert current is not None
    assert current.phase == GamePhase.resolve
    assert response is not None
    assert response["t"] == "phase.change"
    assert response["p"]["phase"] == "resolve"


@pytest.mark.asyncio
async def test_reconnect_request_returns_catchup_when_visible_events_at_most_50(
    repos: Repositories,
    inbound_router: InboundRouter,
) -> None:
    room, player = await _seed_running_room(repos, phase=GamePhase.action)
    for index in range(3):
        await repos.events.append(_event(index, room.id))

    response = await inbound_router.handle_raw(
        player.id,
        _raw(
            "reconnect.request",
            {
                "room_id": room.id,
                "player_id": player.id,
                "last_seq": 0,
                "session_token": "session-1",
            },
        ),
    )

    assert response is not None
    assert response["t"] == "reconnect.catchup"
    assert response["p"]["from_seq"] == 0
    assert len(response["p"]["messages"]) == 3


@pytest.mark.asyncio
async def test_reconnect_request_returns_snapshot_when_visible_events_exceed_50(
    repos: Repositories,
    inbound_router: InboundRouter,
) -> None:
    room, player = await _seed_running_room(repos, phase=GamePhase.action)
    for index in range(51):
        await repos.events.append(_event(index, room.id))

    response = await inbound_router.handle_raw(
        player.id,
        _raw(
            "reconnect.request",
            {
                "room_id": room.id,
                "player_id": player.id,
                "last_seq": 0,
                "session_token": "session-1",
            },
        ),
    )

    assert response is not None
    assert response["t"] == "reconnect.snapshot"
    assert set(response["p"]["full_state"]) >= {
        "factions",
        "regions",
        "relationships",
        "current_turn",
    }
