from __future__ import annotations

from app.core.clock import FrozenClock
from app.domain.world_lighting import WorldLightingPolicy
from app.protocol import (
    WorldLightingPayload,
    deserialize_json,
    make_envelope,
    serialize_json,
)


def test_world_lighting_policy_advances_sun_and_phase_label() -> None:
    policy = WorldLightingPolicy()

    first = policy.next(1)
    second = policy.next(2)
    thirteenth = policy.next(13)

    assert first.sun_lng < second.sun_lng < thirteenth.sun_lng
    assert first.phase_label == "spring_dawn"
    assert thirteenth.phase_label.startswith("summer_")
    assert first.day_color.startswith("#")
    assert first.night_color.startswith("#")


def test_world_lighting_event_round_trip_is_lossless() -> None:
    payload = WorldLightingPayload(
        room_id="room-1",
        epoch=2,
        turn=7,
        sun_lat=21.5,
        sun_lng=-84.0,
        day_color="#d9c37c",
        night_color="#0e1830",
        phase_label="summer_day",
    )
    event = make_envelope(
        "resolve.world_lighting",
        payload,
        clock=FrozenClock(1_234),
        seq=42,
        msg_id="msg_world_lighting",
    )

    raw = serialize_json(event)
    decoded = deserialize_json(raw, WorldLightingPayload)

    assert decoded == event
