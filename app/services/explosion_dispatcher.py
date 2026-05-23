from __future__ import annotations

from typing import Any

from app.domain.enums import EventKind, FactionId
from app.domain.models import GameEvent
from app.domain.world_geometry import WorldGeometry
from app.protocol.explosion_events import ExplosionKind, ExplosionPayload

_SUPPORTED_EVENT_KINDS: set[str] = {
    EventKind.invasion.value,
    EventKind.battle.value,
    EventKind.siege.value,
    EventKind.bombing.value,
    EventKind.naval_assault.value,
    EventKind.uprising.value,
    EventKind.nuclear_strike.value,
}

_KIND_MAPPING: dict[str, ExplosionKind] = {
    EventKind.invasion.value: "conventional",
    EventKind.battle.value: "conventional",
    EventKind.siege.value: "siege",
    EventKind.bombing.value: "aerial",
    EventKind.naval_assault.value: "naval",
    EventKind.uprising.value: "uprising",
    EventKind.nuclear_strike.value: "nuke",
}

_RADIUS_BY_KIND: dict[ExplosionKind, int] = {
    "conventional": 120,
    "aerial": 80,
    "naval": 150,
    "siege": 60,
    "uprising": 40,
    "nuke": 400,
}

_TTL_BY_KIND: dict[ExplosionKind, int] = {
    "conventional": 4_000,
    "aerial": 4_000,
    "naval": 4_000,
    "siege": 5_000,
    "uprising": 4_000,
    "nuke": 6_000,
}


def dispatch_explosions(
    events: list[GameEvent],
    world_geometry: WorldGeometry | None,
    scorched_state: Any,
) -> list[ExplosionPayload]:
    del scorched_state

    capitals = _capital_lookup(world_geometry)
    explosions: list[ExplosionPayload] = []

    for event in events:
        event_kind = _event_kind_value(event)
        if event_kind not in _SUPPORTED_EVENT_KINDS:
            continue

        try:
            attacker_faction, defender_faction = _event_factions(event)
        except ValueError:
            continue
        center = _resolve_center(
            event,
            capitals=capitals,
            attacker_faction=attacker_faction,
            defender_faction=defender_faction,
        )
        if center is None:
            continue

        explosion_kind = _KIND_MAPPING[event_kind]
        casualties = _casualties_estimate(event)
        intensity = _clamp(casualties / 10_000.0, 0.2, 1.0)

        explosions.append(
            ExplosionPayload(
                id=event.id,
                turn=event.turn,
                attacker_faction=attacker_faction,
                defender_faction=defender_faction,
                center_lat=center[0],
                center_lng=center[1],
                radius_km_estimate=_RADIUS_BY_KIND[explosion_kind],
                kind=explosion_kind,
                intensity=round(intensity, 4),
                ttl_ms=_TTL_BY_KIND[explosion_kind],
                casualties_estimate=casualties,
                affected_hex_ids=[],
            )
        )

    return explosions


def _event_kind_value(event: GameEvent) -> str:
    payload_kind = _payload_string(event.payload, "kind")
    if payload_kind in _SUPPORTED_EVENT_KINDS:
        return payload_kind

    payload_subtype = _payload_string(event.payload, "subtype")
    if payload_subtype in _SUPPORTED_EVENT_KINDS:
        return payload_subtype

    payload_military_kind = _payload_string(event.payload, "military_kind")
    if payload_military_kind in _SUPPORTED_EVENT_KINDS:
        return payload_military_kind

    return event.kind.value


def _event_factions(event: GameEvent) -> tuple[FactionId, FactionId]:
    attacker = getattr(event, "attacker", None) or event.actor_faction
    defender = getattr(event, "defender", None) or event.target_faction
    if attacker is None:
        attacker = defender
    if defender is None:
        defender = attacker
    if attacker is None or defender is None:
        raise ValueError(f"military event {event.id} is missing faction endpoints")
    return attacker, defender


def _resolve_center(
    event: GameEvent,
    *,
    capitals: dict[FactionId, tuple[float, float]],
    attacker_faction: FactionId,
    defender_faction: FactionId,
) -> tuple[float, float] | None:
    payload_center = _payload_center(event.payload)
    if payload_center is not None:
        return payload_center

    defender_capital = capitals.get(defender_faction)
    if defender_capital is not None:
        return defender_capital

    attacker_capital = capitals.get(attacker_faction)
    if attacker_capital is not None:
        return attacker_capital

    return None


def _payload_center(payload: dict[str, Any]) -> tuple[float, float] | None:
    lat = payload.get("center_lat")
    lng = payload.get("center_lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return float(lat), float(lng)

    center = payload.get("center_lat_lng")
    if (
        isinstance(center, (list, tuple))
        and len(center) == 2
        and isinstance(center[0], (int, float))
        and isinstance(center[1], (int, float))
    ):
        return float(center[0]), float(center[1])

    return None


def _casualties_estimate(event: GameEvent) -> int:
    payload = event.payload
    candidates = [
        payload.get("casualties_estimate"),
        payload.get("casualties"),
        payload.get("losses"),
        getattr(event, "casualties_estimate", None),
    ]
    for candidate in candidates:
        if isinstance(candidate, (int, float)):
            return max(0, round(float(candidate)))

    atk_loss = getattr(event, "atk_loss", None)
    def_loss = getattr(event, "def_loss", None)
    if isinstance(atk_loss, (int, float)) or isinstance(def_loss, (int, float)):
        return max(0, round(float(atk_loss or 0.0) + float(def_loss or 0.0)))

    return 0


def _capital_lookup(world_geometry: WorldGeometry | None) -> dict[FactionId, tuple[float, float]]:
    if world_geometry is None:
        return {}
    return {faction_id: (lat, lng) for faction_id, lat, lng in world_geometry.capitals}


def _payload_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) else None


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))
