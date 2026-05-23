"""Dispatcher emission tests for epoch narration."""
# ruff: noqa: RUF001, I001

from __future__ import annotations

import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import make_repositories
from app.protocol.narration_events import (
    EpicNarrationPayload,
    SummaryHighlightBattlePayload,
    SummaryHighlightBetrayalPayload,
    SummaryHighlightBundlePayload,
    SummaryHighlightMajorEventPayload,
    SummaryNarrationPayload,
    SummaryRankingRowPayload,
)
from app.services.epoch_narration_service import EpochNarrationBundle


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


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


async def _dispatcher() -> tuple[OutboundDispatcher, FakeSocket]:
    repos = make_repositories("memory")
    room = GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[_player()],
        ai_factions=[faction for faction in FactionId if faction != FactionId.ironCrown],
        current=EpochTurn(
            epoch=3,
            turn=8,
            phase=GamePhase.arbitrate,
            arbitrate_phase=None,
            phase_started_at_ms=1_000,
            phase_duration_ms=12_000,
        ),
        seed=42,
    )
    await repos.rooms.create(room)
    await repos.players.upsert(room.players[0])

    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", "room-1")
    return OutboundDispatcher(manager, repos), socket


@pytest.mark.asyncio
async def test_dispatch_epoch_narration_bundle_emits_epic_before_summary() -> None:
    dispatcher, socket = await _dispatcher()
    bundle = EpochNarrationBundle(
        room_id="room-1",
        epoch=3,
        turn=8,
        generated_at_ms=123_456,
        seq_base=88,
        epic_narration=EpicNarrationPayload(
            epoch=3,
            source="llm",
            narrative="纪元三的风暴终于压到边境。",
            tone="肃杀",
            keyEvents=["边境开战"],
            model="mock",
            generatedAtMs=123_456,
        ),
        summary_narration=SummaryNarrationPayload(
            epoch=3,
            source="llm",
            headline="纪元三：铁冠帝国重夺节奏",
            rankings=[
                SummaryRankingRowPayload(
                    id=FactionId.ironCrown,
                    name="铁冠帝国",
                    totalPower=92.4,
                    previousRank=2,
                    currentRank=1,
                    rankDelta=1,
                    previousPower=86.2,
                )
            ],
            highlights=SummaryHighlightBundlePayload(
                majorEvents=[
                    SummaryHighlightMajorEventPayload(
                        id="event-1",
                        kind="speech",
                        turn=8,
                        priority="P1",
                        actor=FactionId.ironCrown,
                        target=FactionId.starlight,
                        narration="铁冠帝国公开演讲。",
                    )
                ],
                wars=[
                    SummaryHighlightBattlePayload(
                        id="battle-1",
                        kind="battle",
                        turn=8,
                        priority="P0",
                        actor=FactionId.ironCrown,
                        target=FactionId.starlight,
                        regionId="region-1",
                        attackerLoss=2.0,
                        defenderLoss=4.0,
                        attackerRemainingTroops=14.0,
                        defenderRemainingTroops=10.0,
                        narration="边境爆发战争。",
                    )
                ],
                betrayals=[
                    SummaryHighlightBetrayalPayload(
                        id="betrayal-1",
                        kind="betrayal",
                        turn=8,
                        priority="P1",
                        actor=FactionId.starlight,
                        target=FactionId.emerald,
                        narration="翡翠王庭倒向新盟约。",
                    )
                ],
            ),
            model="mock",
            generatedAtMs=123_456,
        ),
    )

    await dispatcher.dispatch_epoch_narration_bundle("room-1", bundle)

    envelopes = [json.loads(text) for text in socket.sent_texts]
    assert [envelope["t"] for envelope in envelopes] == [
        "arbitrate.epic_narration",
        "arbitrate.summary_narration",
    ]
    assert envelopes[0]["seq"] == 88
    assert envelopes[1]["seq"] == 89
    assert envelopes[0]["p"]["source"] == "llm"
    assert envelopes[1]["p"]["headline"] == "纪元三：铁冠帝国重夺节奏"
