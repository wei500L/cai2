from __future__ import annotations

from app.core.logging import get_logger
from app.domain.enums import EventKind, EventPriority, FactionId, TreatyKind, VisibilityScope
from app.domain.models import (
    GameAction,
    GameEvent,
    MapRegion,
    MessageVisibility,
    MilitaryAction,
)

logger = get_logger(__name__)


def derive_events_from_action(
    action: GameAction,
    *,
    faction_pair_known: bool = True,
    regions: list[MapRegion] | None = None,
) -> list[GameEvent]:
    if action.mode == "speech":
        return [
            _event(
                action,
                "speech",
                kind=EventKind.speech,
                priority=EventPriority.P2,
                narration=f"{action.actor_faction} 发表公开声明",
                visibility=_visibility(VisibilityScope.public),
                payload={
                    "action_id": action.id,
                    "content": action.content,
                    "targets": list(action.targets),
                },
            )
        ]

    if action.mode == "private":
        pair = _unique_factions([action.actor_faction, action.target_faction])
        return [
            _event(
                action,
                "private",
                kind=EventKind.private,
                priority=EventPriority.P1,
                target_faction=action.target_faction,
                narration=f"{action.actor_faction} 向 {action.target_faction} 发送密谈",
                visibility=_visibility(VisibilityScope.faction_pair, pair),
                payload={
                    "action_id": action.id,
                    "pair": pair,
                    "content": action.content,
                },
            ),
            _event(
                action,
                "private_meta",
                kind=EventKind.intel,
                priority=EventPriority.P1,
                target_faction=action.target_faction,
                narration=_pair_meta_narration(
                    action.actor_faction,
                    action.target_faction,
                    known=faction_pair_known,
                    suffix="正在密谈",
                ),
                visibility=_visibility(VisibilityScope.public),
                payload={
                    "action_id": action.id,
                    "pair": pair if faction_pair_known else [],
                    "meta": True,
                    "meta_kind": "private_talk",
                },
            ),
        ]

    if action.mode == "treaty":
        parties = _unique_factions([action.actor_faction, *action.target_factions])
        return [
            _event(
                action,
                "treaty",
                kind=_event_kind_for_treaty(action.treaty_kind),
                priority=EventPriority.P1,
                target_faction=action.target_factions[0],
                narration=f"{action.actor_faction} 提出 {action.treaty_kind} 条约请求",
                visibility=_visibility(VisibilityScope.faction_set, parties),
                payload={
                    "action_id": action.id,
                    "set": parties,
                    "treaty_kind": action.treaty_kind,
                    "proposal_text": action.proposal_text,
                },
            ),
            _event(
                action,
                "treaty_meta",
                kind=EventKind.intel,
                priority=EventPriority.P1,
                target_faction=action.target_factions[0],
                narration=f"{action.actor_faction} 与 {', '.join(parties[1:])} 在协商条约",
                visibility=_visibility(VisibilityScope.public),
                payload={
                    "action_id": action.id,
                    "set": parties,
                    "treaty_kind": action.treaty_kind,
                    "meta": True,
                    "meta_kind": "treaty_negotiation",
                },
            ),
        ]

    if action.mode == "military":
        events = [
            _event(
                action,
                "military_self",
                kind=EventKind.battle,
                priority=EventPriority.P1,
                narration=f"{action.actor_faction} 下达军令",
                visibility=_visibility(VisibilityScope.self, [action.actor_faction]),
                payload={
                    "action_id": action.id,
                    "source_region": action.source_region,
                    "target_region": action.target_region,
                    "movement": action.movement,
                    "orders_text": action.orders_text,
                    "troops": action.troops,
                },
            )
        ]
        for faction in sorted(_military_viewer_factions(action, regions or []), key=str):
            fuzzy = fuzz_military_event(action, regions or [], faction)
            if fuzzy is not None:
                events.append(fuzzy)
        return events

    if action.mode == "intel":
        return [
            _event(
                action,
                "intel_self",
                kind=EventKind.intel,
                priority=EventPriority.P1,
                target_faction=action.target_faction,
                narration=f"{action.actor_faction} 执行情报行动",
                visibility=_visibility(VisibilityScope.self, [action.actor_faction]),
                payload={
                    "action_id": action.id,
                    "target_faction": action.target_faction,
                    "intel_kind": action.intel_kind,
                    "brief": action.brief,
                },
            )
        ]

    if action.mode == "lock":
        return []

    raise ValueError(f"Unsupported action mode: {action.mode}")


def build_outbound_events_for_player(
    events: list[GameEvent],
    *,
    viewer_faction: FactionId | None,
) -> list[GameEvent]:
    return [event for event in events if _is_visible_to(event, viewer_faction)]


def adjacent_factions(region_id: str, regions: list[MapRegion]) -> set[FactionId]:
    origin = _find_region(region_id, regions)
    if origin is None:
        return set()

    if origin.neighbors:
        regions_by_id = {region.id: region for region in regions}
        adjacent: set[FactionId] = set()
        for neighbor_id in origin.neighbors:
            neighbor = regions_by_id.get(neighbor_id)
            if neighbor is None or neighbor.id == origin.id or neighbor.owner is None:
                continue
            adjacent.add(neighbor.owner)
        return adjacent

    logger.warning("region %s missing neighbors; falling back to distance adjacency", region_id)
    adjacent: set[FactionId] = set()
    for region in regions:
        if region.id == origin.id or region.owner is None:
            continue
        if _distance_degrees(origin.center_lat_lng, region.center_lat_lng) < 30.0:
            adjacent.add(region.owner)
    return adjacent


def fuzz_military_event(
    action: MilitaryAction,
    regions: list[MapRegion],
    viewer_faction: FactionId,
) -> GameEvent | None:
    if viewer_faction == action.actor_faction:
        return None
    if viewer_faction not in _military_viewer_factions(action, regions):
        return None

    direction = _movement_direction(action.source_region, action.target_region, regions)
    if direction is None:
        return None

    return _event(
        action,
        f"military_fuzzy_{viewer_faction}",
        kind=EventKind.intel,
        priority=EventPriority.P1,
        narration=f"{action.actor_faction} 有军事调动",
        visibility=_visibility(VisibilityScope.faction_set, [viewer_faction]),
        payload={
            "action_id": action.id,
            "set": [viewer_faction],
            "direction": direction,
            "scale": _troop_scale(action.troops),
        },
    )


def _is_visible_to(event: GameEvent, viewer_faction: FactionId | None) -> bool:
    if event.visibility.scope == VisibilityScope.public:
        return True
    if viewer_faction is None:
        return False
    if event.visibility.scope == VisibilityScope.faction_pair:
        return viewer_faction in _payload_factions(event, "pair")
    if event.visibility.scope == VisibilityScope.faction_set:
        return viewer_faction in _payload_factions(event, "set")
    if event.visibility.scope == VisibilityScope.self:
        return viewer_faction == event.actor_faction
    return False


def _payload_factions(event: GameEvent, key: str) -> set[FactionId]:
    raw = event.payload.get(key, event.visibility.faction_ids)
    return {FactionId(item) for item in raw}


def _event(
    action: GameAction,
    suffix: str,
    *,
    kind: EventKind,
    priority: EventPriority,
    narration: str,
    visibility: MessageVisibility,
    payload: dict[str, object],
    target_faction: FactionId | None = None,
) -> GameEvent:
    return GameEvent(
        id=f"event_{action.id}_{suffix}",
        room_id=action.room_id,
        epoch=action.epoch,
        turn=action.turn,
        phase=action.phase,
        created_at_ms=action.created_at_ms,
        priority=priority,
        kind=kind,
        actor_faction=action.actor_faction,
        target_faction=target_faction,
        payload=payload,
        narration=narration,
        visibility=visibility,
    )


def _visibility(
    scope: VisibilityScope,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


def _unique_factions(factions: list[FactionId]) -> list[FactionId]:
    seen: set[FactionId] = set()
    result: list[FactionId] = []
    for faction in factions:
        if faction not in seen:
            seen.add(faction)
            result.append(faction)
    return result


def _event_kind_for_treaty(treaty_kind: TreatyKind) -> EventKind:
    return {
        TreatyKind.trade: EventKind.trade,
        TreatyKind.alliance: EventKind.alliance,
        TreatyKind.non_aggression: EventKind.non_aggression,
        TreatyKind.ceasefire: EventKind.ceasefire,
    }[treaty_kind]


def _pair_meta_narration(
    actor: FactionId,
    target: FactionId,
    *,
    known: bool,
    suffix: str,
) -> str:
    if known:
        return f"{actor} 与 {target} {suffix}"
    return f"有势力{suffix}"


def _find_region(region_id: str, regions: list[MapRegion]) -> MapRegion | None:
    return next((region for region in regions if region.id == region_id), None)


def _distance_degrees(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat_delta = first[0] - second[0]
    lng_delta = first[1] - second[1]
    return (lat_delta**2 + lng_delta**2) ** 0.5


def _military_viewer_factions(action: MilitaryAction, regions: list[MapRegion]) -> set[FactionId]:
    viewers = adjacent_factions(action.source_region, regions) | adjacent_factions(
        action.target_region,
        regions,
    )
    for region_id in (action.source_region, action.target_region):
        region = _find_region(region_id, regions)
        if region is not None and region.owner is not None:
            viewers.add(region.owner)
    viewers.discard(action.actor_faction)
    return viewers


def _movement_direction(
    source_region_id: str,
    target_region_id: str,
    regions: list[MapRegion],
) -> str | None:
    source = _find_region(source_region_id, regions)
    target = _find_region(target_region_id, regions)
    if source is None or target is None:
        return None

    lat_delta = target.center_lat_lng[0] - source.center_lat_lng[0]
    lng_delta = target.center_lat_lng[1] - source.center_lat_lng[1]
    if abs(lat_delta) >= abs(lng_delta):
        return "north" if lat_delta >= 0 else "south"
    return "east" if lng_delta >= 0 else "west"


def _troop_scale(troops: int | None) -> str:
    troop_count = troops or 0
    if troop_count < 30:
        return "small"
    if troop_count <= 80:
        return "medium"
    return "large"
