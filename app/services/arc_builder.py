from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import EventKind, FactionId
from app.domain.factions import get_faction_meta
from app.domain.models import GameEvent

Capital = tuple[float, float]
ArcKind = Literal["speech", "private", "treaty", "declaration", "trade"]
RippleKind = Literal["speech", "shockwave"]

SPEECH_ARC_TTL_MS = 4_000
PRIVATE_ARC_TTL_MS = 2_000
TREATY_ARC_TTL_MS = 6_000
DECLARATION_ARC_TTL_MS = 8_000
TRADE_ARC_TTL_MS = 5_000
MILITARY_ARC_TTL_MS = 4_000

SPEECH_RIPPLE_TTL_MS = 4_000
DECLARATION_RIPPLE_TTL_MS = 8_000
CITY_FALL_RIPPLE_TTL_MS = 4_000

SPEECH_RIPPLE_COLOR = "#33FFFF"
DECLARATION_COLOR = "#FF3333"
TRADE_COLOR = "#CCAA33"
CITY_FALL_RIPPLE_COLOR = "#050505"


class ArcSpec(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    id: str
    kind: ArcKind
    from_faction: FactionId
    to_faction: FactionId
    color: list[str] = Field(min_length=2, max_length=2)
    ttl_ms: int = Field(gt=0)
    created_at_ms: int | None = None
    intensity: float = Field(default=0.7, ge=0.0, le=1.0)
    stroke: float = Field(default=0.6, gt=0.0)
    dashed: bool = True
    bidirectional: bool = False
    dash_length: float = Field(default=0.3, ge=0.0)
    dash_gap: float = Field(default=0.05, ge=0.0)
    dash_animate_time: int = Field(default=1_500, ge=0)


class RippleSpec(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    id: str
    kind: RippleKind
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)
    color: str
    max_radius: float = Field(gt=0.0)
    ttl_ms: int = Field(gt=0)
    created_at_ms: int | None = None


def build_arcs_from_events(
    events: list[GameEvent],
    capitals: dict[FactionId, Capital],
) -> list[ArcSpec]:
    arcs: list[ArcSpec] = []
    for event in events:
        if event.actor_faction is None:
            continue

        if event.kind == EventKind.speech:
            arcs.extend(_speech_arcs(event, capitals))
        elif event.kind == EventKind.private:
            arc = _pair_arc(
                event,
                kind="private",
                ttl_ms=PRIVATE_ARC_TTL_MS,
                intensity=0.75,
                stroke=0.7,
                dashed=True,
                bidirectional=True,
                dash_length=0.24,
                dash_gap=0.08,
                dash_animate_time=PRIVATE_ARC_TTL_MS,
            )
            if arc is not None and _has_capitals(arc.from_faction, arc.to_faction, capitals):
                arcs.append(arc)
        elif event.kind in {EventKind.alliance, EventKind.non_aggression, EventKind.ceasefire}:
            arc = _pair_arc(
                event,
                kind="treaty",
                ttl_ms=TREATY_ARC_TTL_MS,
                intensity=0.85,
                stroke=0.8,
                dashed=False,
                bidirectional=False,
                dash_length=0.0,
                dash_gap=0.0,
                dash_animate_time=0,
            )
            if arc is not None and _has_capitals(arc.from_faction, arc.to_faction, capitals):
                arcs.append(arc)
        elif event.kind == EventKind.declare_war:
            arc = _pair_arc(
                event,
                kind="declaration",
                ttl_ms=DECLARATION_ARC_TTL_MS,
                intensity=1.0,
                stroke=1.2,
                color=[DECLARATION_COLOR, DECLARATION_COLOR],
                dashed=True,
                bidirectional=False,
                dash_length=0.16,
                dash_gap=0.08,
                dash_animate_time=DECLARATION_ARC_TTL_MS,
            )
            if arc is not None and _has_capitals(arc.from_faction, arc.to_faction, capitals):
                arcs.append(arc)
        elif event.kind == EventKind.trade:
            arc = _pair_arc(
                event,
                kind="trade",
                ttl_ms=TRADE_ARC_TTL_MS,
                intensity=0.65,
                stroke=0.45,
                color=[TRADE_COLOR, TRADE_COLOR],
                dashed=False,
                bidirectional=False,
                dash_length=0.0,
                dash_gap=0.0,
                dash_animate_time=0,
            )
            if arc is not None and _has_capitals(arc.from_faction, arc.to_faction, capitals):
                arcs.append(arc)
        elif event.kind in _military_event_kinds():
            arc = _pair_arc(
                event,
                kind="declaration",
                ttl_ms=MILITARY_ARC_TTL_MS,
                intensity=1.0,
                stroke=1.4,
                color=[DECLARATION_COLOR, DECLARATION_COLOR],
                dashed=False,
                bidirectional=False,
                dash_length=0.0,
                dash_gap=0.0,
                dash_animate_time=0,
            )
            if arc is not None and _has_capitals(arc.from_faction, arc.to_faction, capitals):
                arcs.append(arc)

    return arcs


def build_ripples_from_events(
    events: list[GameEvent],
    capitals: dict[FactionId, Capital] | None = None,
) -> list[RippleSpec]:
    capitals = capitals or {}
    ripples: list[RippleSpec] = []

    for event in events:
        if event.kind == EventKind.speech and event.actor_faction is not None:
            ripple = _capital_ripple(
                event,
                capitals,
                kind="speech",
                color=SPEECH_RIPPLE_COLOR,
                max_radius=300,
                ttl_ms=SPEECH_RIPPLE_TTL_MS,
            )
            if ripple is not None:
                ripples.append(ripple)
        elif event.kind == EventKind.declare_war and event.actor_faction is not None:
            ripple = _capital_ripple(
                event,
                capitals,
                kind="shockwave",
                color=DECLARATION_COLOR,
                max_radius=500,
                ttl_ms=DECLARATION_RIPPLE_TTL_MS,
            )
            if ripple is not None:
                ripples.append(ripple)
        elif event.kind == EventKind.battle and _payload_bool(event.payload, "territory_captured"):
            point = _payload_point(event.payload)
            if point is None:
                continue
            lat, lng = point
            ripples.append(
                RippleSpec(
                    id=f"{event.id}:ripple:city-fall",
                    kind="shockwave",
                    lat=lat,
                    lng=lng,
                    color=CITY_FALL_RIPPLE_COLOR,
                    max_radius=200,
                    ttl_ms=CITY_FALL_RIPPLE_TTL_MS,
                    created_at_ms=event.created_at_ms,
                )
            )

    return ripples


def _speech_arcs(
    event: GameEvent,
    capitals: dict[FactionId, Capital],
) -> list[ArcSpec]:
    actor = event.actor_faction
    if actor is None or actor not in capitals:
        return []

    targets = _speech_targets(event, capitals)
    source_meta = get_faction_meta(actor)
    arcs: list[ArcSpec] = []
    for index, target in enumerate(targets):
        if target == actor or target not in capitals:
            continue
        target_meta = get_faction_meta(target)
        arcs.append(
            ArcSpec(
                id=f"{event.id}:arc:speech:{index}:{target.value}",
                kind="speech",
                from_faction=actor,
                to_faction=target,
                color=[source_meta.primary_color, target_meta.glow_color],
                ttl_ms=SPEECH_ARC_TTL_MS,
                created_at_ms=event.created_at_ms,
                intensity=0.7,
                stroke=0.6,
                dashed=True,
                dash_length=0.3,
                dash_gap=0.05,
                dash_animate_time=1_500,
            )
        )
    return arcs


def _pair_arc(
    event: GameEvent,
    *,
    kind: ArcKind,
    ttl_ms: int,
    intensity: float,
    stroke: float,
    color: list[str] | None = None,
    dashed: bool,
    bidirectional: bool,
    dash_length: float,
    dash_gap: float,
    dash_animate_time: int,
) -> ArcSpec | None:
    if event.actor_faction is None or event.target_faction is None:
        return None

    color = color or [
        get_faction_meta(event.actor_faction).primary_color,
        get_faction_meta(event.target_faction).glow_color,
    ]
    return ArcSpec(
        id=f"{event.id}:arc:{kind}:{event.actor_faction.value}:{event.target_faction.value}",
        kind=kind,
        from_faction=event.actor_faction,
        to_faction=event.target_faction,
        color=color,
        ttl_ms=ttl_ms,
        created_at_ms=event.created_at_ms,
        intensity=intensity,
        stroke=stroke,
        dashed=dashed,
        bidirectional=bidirectional,
        dash_length=dash_length,
        dash_gap=dash_gap,
        dash_animate_time=dash_animate_time,
    )


def _capital_ripple(
    event: GameEvent,
    capitals: dict[FactionId, Capital],
    *,
    kind: RippleKind,
    color: str,
    max_radius: float,
    ttl_ms: int,
) -> RippleSpec | None:
    if event.actor_faction is None:
        return None
    point = capitals.get(event.actor_faction)
    if point is None:
        return None
    lat, lng = point
    return RippleSpec(
        id=f"{event.id}:ripple:{kind}:{event.actor_faction.value}",
        kind=kind,
        lat=lat,
        lng=lng,
        color=color,
        max_radius=max_radius,
        ttl_ms=ttl_ms,
        created_at_ms=event.created_at_ms,
    )


def _speech_targets(
    event: GameEvent,
    capitals: dict[FactionId, Capital],
) -> list[FactionId]:
    raw_targets = event.payload.get("targets")
    if isinstance(raw_targets, list) and raw_targets:
        targets = [_coerce_faction_id(target) for target in raw_targets]
        return [target for target in targets if target is not None]
    return sorted(
        (faction_id for faction_id in capitals if faction_id != event.actor_faction),
        key=str,
    )


def _has_capitals(
    from_faction: FactionId,
    to_faction: FactionId,
    capitals: dict[FactionId, Capital],
) -> bool:
    return from_faction in capitals and to_faction in capitals


def _coerce_faction_id(value: Any) -> FactionId | None:
    if isinstance(value, FactionId):
        return value
    if isinstance(value, str):
        try:
            return FactionId(value)
        except ValueError:
            return None
    return None


def _payload_bool(payload: dict[str, Any], key: str) -> bool:
    value = payload.get(key)
    return value is True


def _payload_point(payload: dict[str, Any]) -> Capital | None:
    if isinstance(payload.get("center_lat"), (int, float)) and isinstance(
        payload.get("center_lng"),
        (int, float),
    ):
        return float(payload["center_lat"]), float(payload["center_lng"])

    center = payload.get("center_lat_lng")
    if (
        isinstance(center, (list, tuple))
        and len(center) == 2
        and isinstance(center[0], (int, float))
        and isinstance(center[1], (int, float))
    ):
        return float(center[0]), float(center[1])
    return None


def _military_event_kinds() -> set[EventKind]:
    return {
        EventKind.battle,
        EventKind.invasion,
        EventKind.siege,
        EventKind.bombing,
        EventKind.naval_assault,
        EventKind.uprising,
        EventKind.nuclear_strike,
    }
