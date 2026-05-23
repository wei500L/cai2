from __future__ import annotations

from typing import Any

from app.domain.enums import EventKind
from app.domain.models import GameEvent
from app.domain.world_geometry import WorldGeometry
from app.protocol.explosion_events import ExplosionKind, ExplosionPayload

_SUPPORTED_EVENT_KINDS: set[str] = {
    EventKind.battle.value,
    EventKind.betrayal.value,
    EventKind.bombing.value,
    EventKind.declare_war.value,
    EventKind.invasion.value,
    EventKind.intel.value,
    EventKind.naval_assault.value,
    EventKind.nuclear_strike.value,
    EventKind.siege.value,
    EventKind.uprising.value,
}

_KIND_MAPPING: dict[str, ExplosionKind] = {
    EventKind.battle.value: "conventional",
    EventKind.betrayal.value: "conventional",
    EventKind.bombing.value: "aerial",
    EventKind.declare_war.value: "conventional",
    EventKind.invasion.value: "conventional",
    EventKind.intel.value: "aerial",
    EventKind.naval_assault.value: "naval",
    EventKind.nuclear_strike.value: "nuke",
    EventKind.siege.value: "siege",
    EventKind.uprising.value: "uprising",
}

_TTL_BY_KIND: dict[ExplosionKind, int] = {
    "conventional": 2,
    "aerial": 1,
    "naval": 0,
    "siege": 2,
    "uprising": 1,
    "nuke": 5,
    "artillery": 1,
    "missile": 1,
    "other": 1,
}

_FALLOUT_BY_KIND: dict[ExplosionKind, float] = {
    "conventional": 0.0,
    "aerial": 0.1,
    "naval": 0.0,
    "siege": 0.06,
    "uprising": 0.14,
    "nuke": 0.6,
    "artillery": 0.05,
    "missile": 0.2,
    "other": 0.02,
}

_LOSS_BY_KIND: dict[ExplosionKind, float] = {
    "conventional": 0.1,
    "aerial": 0.08,
    "naval": 0.04,
    "siege": 0.16,
    "uprising": 0.09,
    "nuke": 0.35,
    "artillery": 0.1,
    "missile": 0.2,
    "other": 0.05,
}

_INTENSITY_BY_KIND: dict[ExplosionKind, float] = {
    "conventional": 1.25,
    "aerial": 1.25,
    "naval": 1.25,
    "siege": 1.8,
    "uprising": 1.25,
    "nuke": 2.8,
    "artillery": 1.1,
    "missile": 1.15,
    "other": 1.0,
}

_CINEMATIC_HINT_BY_KIND: dict[ExplosionKind, str] = {
    "nuke": "nuke_cinematic",
    "conventional": "focus_long",
    "aerial": "focus_long",
    "naval": "focus_long",
    "siege": "focus_long",
    "uprising": "focus_short",
    "artillery": "none",
    "missile": "none",
    "other": "none",
}


def dispatch_explosions(
    events: list[GameEvent],
    world_geometry: WorldGeometry | None,
    scorched_state: Any,
) -> list[ExplosionPayload]:
    del world_geometry, scorched_state

    explosions: list[ExplosionPayload] = []
    for event in events:
        event_kind = event.kind.value
        if event_kind not in _SUPPORTED_EVENT_KINDS:
            continue

        kind = _KIND_MAPPING.get(event_kind, "other")
        primary_hex_id = _event_hex_id(event)
        if not primary_hex_id:
            continue

        explosions.append(
            ExplosionPayload(
                room_id=event.room_id,
                epoch=event.epoch,
                turn=event.turn,
                event_id=event.id,
                source_region_id=_event_region_id(event),
                kind=kind,
                primary_hex_id=primary_hex_id,
                affected_hex_ids=[primary_hex_id],
                scorched_turns=_TTL_BY_KIND[kind],
                fallout_severity=_FALLOUT_BY_KIND[kind],
                economic_loss_pct=_LOSS_BY_KIND[kind],
                narrative_hint=event.narration[:240] or "爆炸事件",
                intensity=_INTENSITY_BY_KIND[kind],
                cinematic_hint=_CINEMATIC_HINT_BY_KIND[kind],
            )
        )

    return explosions


def _event_region_id(event: GameEvent) -> str | None:
    region_id = event.payload.get("region_id")
    if isinstance(region_id, str):
        return region_id
    if hasattr(event, "region_id"):
        value = event.__dict__.get("region_id")
        if isinstance(value, str):
            return value
    return None


def _event_hex_id(event: GameEvent) -> str | None:
    payload = event.payload
    for key in ("center_hex_id", "hex_id", "primary_hex_id"):
        value = payload.get(key)
        if isinstance(value, str):
            return value

    region_id = _event_region_id(event)
    if region_id is None:
        return None
    if region_id.startswith("H") and "_" in region_id:
        return region_id
    suffix = region_id.rsplit("_", 1)[-1]
    if suffix.isdigit():
        return f"H0_{int(suffix):05d}"
    return region_id
