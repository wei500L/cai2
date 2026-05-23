from __future__ import annotations

import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import FrozenClock
from app.domain.enums import FactionId
from app.repositories.factory import make_repositories
from app.services.replay_service import ReplayDTO


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


@pytest.mark.asyncio
async def test_dispatch_room_finished_sends_contract_payload() -> None:
    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", "room-1")

    dispatcher = OutboundDispatcher(manager, make_repositories("memory"), FrozenClock(1000))
    replay = ReplayDTO(
        room_id="room-1",
        generated_at_ms=1000,
        mode="solo_1v7",
        total_epochs=8,
        total_turns=24,
        timeline=[],
        public_events=[],
        private_messages=[],
        ai_internal_thoughts=[],
        faction_curves=[],
        relationship_snapshots=[],
        key_moments=[],
        famous_quotes=[],
        betrayal_events=[],
        deception_stats=[],
        final_factions=[],
        winner=FactionId.ironCrown,
        final_narration="铁冠帝国完成最终统治。",
    )

    await dispatcher.dispatch_room_finished(
        "room-1",
        winner=replay.winner,
        final_narration=replay.final_narration,
        replay_available=True,
    )

    assert len(socket.sent_texts) == 1
    message = json.loads(socket.sent_texts[0])
    assert message["t"] == "room.finished"
    assert message["p"] == {
        "room_id": "room-1",
        "winner": "ironCrown",
        "final_narration": "铁冠帝国完成最终统治。",
        "replay_available": True,
    }
