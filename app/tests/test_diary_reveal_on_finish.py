from __future__ import annotations

import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import FrozenClock
from app.domain.enums import (
    ArbitratePhase,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
)
from app.domain.models import DiaryEntry, EpochTurn, GameRoom, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.phase_service import PhaseService


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(200_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


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
        ai_factions=[faction_id for faction_id in FactionId if faction_id != player.faction_id],
        current=EpochTurn(
            epoch=8,
            turn=3,
            phase=GamePhase.arbitrate,
            arbitrate_phase=ArbitratePhase.summary,
            phase_started_at_ms=100_000,
            phase_duration_ms=1_000,
        ),
        seed=42,
    )


@pytest.mark.asyncio
async def test_finished_phase_emits_diary_reveal(repos: Repositories, clock: FrozenClock) -> None:
    room = _room()
    await repos.rooms.create(room)
    await repos.players.upsert(room.players[0])
    await repos.state.save_current_turn(room.id, room.current)
    await repos.diaries.append(
        DiaryEntry(
            faction_id=FactionId.ironCrown,
            epoch=8,
            turn=3,
            internal_thought="最后一回合, 我们只能先稳住军心。",
            emotion="grim",
            triggers=[],
            created_at_ms=199_000,
        ),
        room_id=room.id,
    )

    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", room.id)

    dispatcher = OutboundDispatcher(manager, repos)
    service = PhaseService(repos, clock, on_room_finished=dispatcher.dispatch_diary_reveal)

    await service.advance_phase(room.id)

    stored = await repos.rooms.get(room.id)
    assert stored is not None
    assert stored.status == RoomStatus.finished
    assert len(socket.sent_texts) == len(tuple(FactionId))

    reveal_messages = [json.loads(text) for text in socket.sent_texts]
    assert all(message["t"] == "replay.ai_diary_reveal" for message in reveal_messages)
    first = reveal_messages[0]["p"]
    assert first["room_id"] == room.id
    assert first["faction_id"] == "ironCrown"
    assert first["entries"][0]["internal_thought"] == "最后一回合, 我们只能先稳住军心。"
