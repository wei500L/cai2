from __future__ import annotations

import pytest

from app.domain.enums import (
    ArbitratePhase,
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    RelationshipStatus,
    TreatyKind,
)
from app.protocol.outgoing import PhaseChangePayload


def test_enum_literal_sets_are_stable() -> None:
    assert [item.value for item in FactionId] == [
        "ironCrown",
        "starlight",
        "emerald",
        "ashen",
        "voidChurch",
        "aurora",
        "magma",
        "darkTide",
    ]
    assert [item.value for item in GamePhase] == [
        "observe",
        "action",
        "resolve",
        "arbitrate",
    ]
    assert [item.value for item in ArbitratePhase] == ["battle", "epic", "summary"]
    assert [item.value for item in TreatyKind] == [
        "non_aggression",
        "trade",
        "alliance",
        "ceasefire",
    ]
    assert [item.value for item in RelationshipStatus] == [
        "hostile",
        "wary",
        "neutral",
        "friendly",
        "allied",
    ]
    assert [item.value for item in EventPriority] == ["P0", "P1", "P2"]
    assert [item.value for item in EventKind] == [
        "speech",
        "private",
        "declare_war",
        "alliance",
        "trade",
        "non_aggression",
        "ceasefire",
        "betrayal",
        "battle",
        "invasion",
        "siege",
        "bombing",
        "naval_assault",
        "uprising",
        "nuclear_strike",
        "economy",
        "intel",
        "phase_change",
        "ai_thinking",
        "ai_reaction",
        "narration",
    ]


@pytest.mark.parametrize("phase", list(GamePhase))
def test_phase_change_payload_accepts_every_game_phase(phase: GamePhase) -> None:
    arbitrate_phase = ArbitratePhase.battle if phase is GamePhase.arbitrate else None
    payload = PhaseChangePayload(
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=phase,
        arbitrate_phase=arbitrate_phase,
        phase_duration_ms=30_000,
        phase_started_at_ms=1_000,
        server_time_ms=2_000,
    )

    assert payload.phase is phase
    assert payload.arbitrate_phase is arbitrate_phase
