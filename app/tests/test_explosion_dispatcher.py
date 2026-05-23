from __future__ import annotations

import pytest

from app.domain.enums import EventKind, EventPriority, FactionId, GamePhase, VisibilityScope
from app.domain.models import GameEvent, MessageVisibility
from app.services.explosion_dispatcher import dispatch_explosions


def _event(event_id: str, kind: EventKind) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=GamePhase.resolve,
        created_at_ms=1_000,
        priority=EventPriority.P0,
        kind=kind,
        actor_faction=FactionId.ironCrown,
        target_faction=FactionId.starlight,
        payload={
            "center_hex_id": "hex-1",
            "region_id": "region-1",
        },
        narration=f"{kind.value} event",
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


@pytest.mark.parametrize(
    ("event_kind", "expected_kind", "expected_hint", "expected_intensity"),
    [
        (EventKind.nuclear_strike, "nuke", "nuke_cinematic", 2.8),
        (EventKind.siege, "siege", "focus_long", 1.8),
        (EventKind.bombing, "aerial", "focus_long", 1.25),
        (EventKind.uprising, "uprising", "focus_short", 1.25),
    ],
)
def test_dispatch_explosions_sets_cinematic_hint_by_kind(
    event_kind: EventKind,
    expected_kind: str,
    expected_hint: str,
    expected_intensity: float,
) -> None:
    explosions = dispatch_explosions([_event("event-1", event_kind)], None, None)

    assert len(explosions) == 1
    explosion = explosions[0]
    assert explosion.kind == expected_kind
    assert explosion.cinematic_hint == expected_hint
    assert explosion.intensity == pytest.approx(expected_intensity)
    assert explosion.primary_hex_id == "hex-1"
    assert explosion.affected_hex_ids == ["hex-1"]
