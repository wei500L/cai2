from __future__ import annotations

from app.domain.enums import EventKind, EventPriority, FactionId, GamePhase, VisibilityScope
from app.domain.factions import get_faction_meta
from app.domain.models import GameEvent, MessageVisibility
from app.services.arc_builder import build_arcs_from_events, build_ripples_from_events


def _visibility(scope: VisibilityScope = VisibilityScope.public) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=[])


def _event(
    *,
    event_id: str,
    kind: EventKind,
    actor: FactionId,
    target: FactionId | None = None,
    payload: dict[str, object] | None = None,
) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        seq=1,
        epoch=1,
        turn=2,
        phase=GamePhase.resolve,
        created_at_ms=1_000,
        priority=EventPriority.P1,
        kind=kind,
        actor_faction=actor,
        target_faction=target,
        payload=payload or {},
        narration=f"{kind.value}:{actor.value}",
        visibility=_visibility(),
    )


def _capital_map() -> dict[FactionId, tuple[float, float]]:
    return {
        faction_id: (10.0 + index, 20.0 + index)
        for index, faction_id in enumerate(FactionId)
    }


def test_speech_builds_one_arc_per_other_faction_and_one_ripple() -> None:
    capitals = _capital_map()
    actor = FactionId.ironCrown
    arcs = build_arcs_from_events(
        [
            _event(
                event_id="speech-1",
                kind=EventKind.speech,
                actor=actor,
                payload={"targets": []},
            )
        ],
        capitals,
    )
    ripples = build_ripples_from_events(
        [
            _event(
                event_id="speech-1",
                kind=EventKind.speech,
                actor=actor,
                payload={"targets": []},
            )
        ],
        capitals,
    )

    assert len(arcs) == len(capitals) - 1
    assert len(ripples) == 1
    assert ripples[0].kind == "speech"
    assert ripples[0].color == "#33FFFF"
    assert ripples[0].max_radius == 300

    target_ids = {arc.to_faction for arc in arcs}
    assert target_ids == set(capitals) - {actor}
    for arc in arcs:
        assert arc.kind == "speech"
        assert arc.from_faction == actor
        assert arc.color[0] == get_faction_meta(actor).primary_color
        assert arc.color[1] == get_faction_meta(arc.to_faction).glow_color
        assert arc.ttl_ms == 4_000


def test_private_builds_one_bidirectional_arc() -> None:
    capitals = _capital_map()
    actor = FactionId.ironCrown
    target = FactionId.starlight
    arcs = build_arcs_from_events(
        [
            _event(
                event_id="private-1",
                kind=EventKind.private,
                actor=actor,
                target=target,
                payload={"pair": [actor, target]},
            )
        ],
        capitals,
    )

    assert len(arcs) == 1
    arc = arcs[0]
    assert arc.kind == "private"
    assert arc.bidirectional is True
    assert arc.ttl_ms == 2_000
    assert arc.color == [
        get_faction_meta(actor).primary_color,
        get_faction_meta(target).glow_color,
    ]


def test_treaty_war_trade_type_mapping_is_correct() -> None:
    capitals = _capital_map()
    actor = FactionId.ironCrown
    target = FactionId.starlight
    treaty_arc = build_arcs_from_events(
        [
            _event(
                event_id="treaty-1",
                kind=EventKind.alliance,
                actor=actor,
                target=target,
            ),
            _event(
                event_id="war-1",
                kind=EventKind.declare_war,
                actor=actor,
                target=target,
            ),
            _event(
                event_id="trade-1",
                kind=EventKind.trade,
                actor=actor,
                target=target,
            ),
        ],
        capitals,
    )

    assert [arc.kind for arc in treaty_arc] == ["treaty", "declaration", "trade"]
    assert treaty_arc[0].ttl_ms == 6_000
    assert treaty_arc[0].dashed is False
    assert treaty_arc[1].ttl_ms == 8_000
    assert treaty_arc[1].stroke == 1.2
    assert treaty_arc[2].ttl_ms == 5_000
    assert treaty_arc[2].stroke == 0.45
    assert treaty_arc[1].color == ["#FF3333", "#FF3333"]
    assert treaty_arc[2].color == ["#CCAA33", "#CCAA33"]


def test_war_and_city_fall_build_ripples() -> None:
    capitals = _capital_map()
    actor = FactionId.ironCrown
    ripples = build_ripples_from_events(
        [
            _event(
                event_id="speech-1",
                kind=EventKind.speech,
                actor=actor,
            ),
            _event(
                event_id="war-1",
                kind=EventKind.declare_war,
                actor=actor,
            ),
            _event(
                event_id="battle-1",
                kind=EventKind.battle,
                actor=actor,
                target=FactionId.starlight,
                payload={
                    "territory_captured": True,
                    "center_lat": 12.5,
                    "center_lng": 34.5,
                },
            ),
        ],
        capitals,
    )

    assert [ripple.kind for ripple in ripples] == ["speech", "shockwave", "shockwave"]
    assert ripples[1].color == "#FF3333"
    assert ripples[1].max_radius == 500
    assert ripples[2].color == "#050505"
    assert ripples[2].max_radius == 200
    assert ripples[2].lat == 12.5
    assert ripples[2].lng == 34.5
