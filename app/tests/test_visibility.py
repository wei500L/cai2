from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    TerrainKind,
    TreatyKind,
    VisibilityScope,
)
from app.domain.models import (
    EpochTurn,
    GameRoom,
    IntelAction,
    LockAction,
    MapRegion,
    MessageVisibility,
    MilitaryAction,
    Player,
    PrivateMessageAction,
    SpeechAction,
    TreatyAction,
)
from app.game.visibility import (
    adjacent_factions,
    build_outbound_events_for_player,
    derive_events_from_action,
    fuzz_military_event,
)
from app.repositories.factory import make_repositories
from app.services.action_service import ActionService


def _visibility(scope: VisibilityScope = VisibilityScope.public) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=[])


def _base_action_payload(action_id: str) -> dict[str, object]:
    return {
        "id": action_id,
        "room_id": "room-1",
        "epoch": 1,
        "turn": 1,
        "phase": GamePhase.action,
        "actor_player_id": "player-a",
        "actor_faction": FactionId.ironCrown,
        "created_at_ms": 1000,
    }


def _speech_action() -> SpeechAction:
    return SpeechAction(
        **_base_action_payload("action-speech"),
        visibility=_visibility(),
        mode="speech",
        content="public words",
        targets=[],
    )


def _private_action() -> PrivateMessageAction:
    return PrivateMessageAction(
        **_base_action_payload("action-private"),
        visibility=_visibility(VisibilityScope.faction_pair),
        mode="private",
        content="secret words",
        target_faction=FactionId.starlight,
    )


def _treaty_action() -> TreatyAction:
    return TreatyAction(
        **_base_action_payload("action-treaty"),
        visibility=_visibility(VisibilityScope.faction_set),
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight, FactionId.emerald],
        proposal_text="shared trade route",
    )


def _military_action(troops: int | None = 50) -> MilitaryAction:
    return MilitaryAction(
        **_base_action_payload(f"action-military-{troops}"),
        visibility=_visibility(VisibilityScope.self),
        mode="military",
        source_region="region-a",
        target_region="region-x",
        movement="attack",
        orders_text="attack at dawn",
        troops=troops,
    )


def _intel_action() -> IntelAction:
    return IntelAction(
        **_base_action_payload("action-intel"),
        visibility=_visibility(VisibilityScope.self),
        mode="intel",
        target_faction=FactionId.starlight,
        intel_kind="spy",
        brief="watch border",
    )


def _lock_action() -> LockAction:
    return LockAction(
        **_base_action_payload("action-lock"),
        visibility=_visibility(VisibilityScope.self),
        mode="lock",
    )


def _region(
    region_id: str,
    owner: FactionId | None,
    center: tuple[float, float],
) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=1.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=center,
        min_garrison=10,
        supply_lines=1,
    )


def _regions() -> list[MapRegion]:
    return [
        _region("region-a", FactionId.ironCrown, (0.0, 0.0)),
        _region("region-x", FactionId.starlight, (10.0, 0.0)),
        _region("region-y", FactionId.starlight, (12.0, 1.0)),
        _region("region-z", FactionId.emerald, (80.0, 80.0)),
    ]


def test_speech_generates_public_event_visible_to_all_viewers() -> None:
    events = derive_events_from_action(_speech_action())

    assert len(events) == 1
    assert events[0].kind == EventKind.speech
    assert events[0].priority == EventPriority.P2
    assert events[0].visibility.scope == VisibilityScope.public
    assert events[0].narration == f"{FactionId.ironCrown} 发表公开声明"

    for faction in FactionId:
        assert build_outbound_events_for_player(events, viewer_faction=faction) == events
    assert build_outbound_events_for_player(events, viewer_faction=None) == events


def test_private_generates_full_pair_event_and_public_meta() -> None:
    events = derive_events_from_action(_private_action())

    assert [event.kind for event in events] == [EventKind.private, EventKind.intel]
    assert events[0].visibility.scope == VisibilityScope.faction_pair
    assert events[0].payload["pair"] == [FactionId.ironCrown, FactionId.starlight]
    assert events[1].visibility.scope == VisibilityScope.public
    assert events[1].payload["meta"] is True

    for faction in (FactionId.ironCrown, FactionId.starlight):
        visible = build_outbound_events_for_player(events, viewer_faction=faction)
        assert events[0] in visible
        assert events[1] in visible

    for faction in set(FactionId) - {FactionId.ironCrown, FactionId.starlight}:
        visible = build_outbound_events_for_player(events, viewer_faction=faction)
        assert visible == [events[1]]


def test_treaty_generates_full_party_event_and_public_meta() -> None:
    events = derive_events_from_action(_treaty_action())

    assert [event.kind for event in events] == [EventKind.trade, EventKind.intel]
    assert events[0].visibility.scope == VisibilityScope.faction_set
    assert events[0].payload["set"] == [
        FactionId.ironCrown,
        FactionId.starlight,
        FactionId.emerald,
    ]
    assert events[0].payload["proposal_text"] == "shared trade route"
    assert events[1].visibility.scope == VisibilityScope.public

    for faction in (FactionId.ironCrown, FactionId.starlight, FactionId.emerald):
        visible = build_outbound_events_for_player(events, viewer_faction=faction)
        assert events[0] in visible
        assert events[1] in visible

    for faction in set(FactionId) - {FactionId.ironCrown, FactionId.starlight, FactionId.emerald}:
        visible = build_outbound_events_for_player(events, viewer_faction=faction)
        assert visible == [events[1]]


def test_military_generates_self_detail_and_neighbor_fuzzy_event() -> None:
    events = derive_events_from_action(_military_action(troops=50), regions=_regions())

    actor_visible = build_outbound_events_for_player(events, viewer_faction=FactionId.ironCrown)
    neighbor_visible = build_outbound_events_for_player(events, viewer_faction=FactionId.starlight)
    far_visible = build_outbound_events_for_player(events, viewer_faction=FactionId.emerald)

    assert len(actor_visible) == 1
    assert actor_visible[0].visibility.scope == VisibilityScope.self
    assert actor_visible[0].payload["orders_text"] == "attack at dawn"
    assert len(neighbor_visible) == 1
    assert neighbor_visible[0].payload["direction"] == "north"
    assert neighbor_visible[0].payload["scale"] == "medium"
    assert far_visible == []


def test_intel_is_visible_only_to_actor() -> None:
    events = derive_events_from_action(_intel_action())

    assert len(events) == 1
    assert build_outbound_events_for_player(events, viewer_faction=FactionId.ironCrown) == events
    for faction in set(FactionId) - {FactionId.ironCrown}:
        assert build_outbound_events_for_player(events, viewer_faction=faction) == []
    assert build_outbound_events_for_player(events, viewer_faction=None) == []


def test_lock_generates_no_outbound_events() -> None:
    events = derive_events_from_action(_lock_action())

    assert events == []
    for faction in FactionId:
        assert build_outbound_events_for_player(events, viewer_faction=faction) == []


def test_adjacent_factions_uses_distance_threshold() -> None:
    regions = [
        _region("origin", FactionId.ironCrown, (0.0, 0.0)),
        _region("near", FactionId.starlight, (29.0, 0.0)),
        _region("edge", FactionId.emerald, (30.0, 0.0)),
        _region("far", FactionId.ashen, (30.1, 0.0)),
    ]

    assert adjacent_factions("origin", regions) == {FactionId.starlight}
    assert adjacent_factions("missing", regions) == set()


@pytest.mark.parametrize(
    ("troops", "expected_scale"),
    [
        (29, "small"),
        (30, "medium"),
        (80, "medium"),
        (81, "large"),
        (None, "small"),
    ],
)
def test_fuzz_military_event_scale_boundaries(
    troops: int | None,
    expected_scale: str,
) -> None:
    event = fuzz_military_event(_military_action(troops=troops), _regions(), FactionId.starlight)

    assert event is not None
    assert event.payload["direction"] == "north"
    assert event.payload["scale"] == expected_scale
    assert "orders_text" not in event.payload
    assert "troops" not in event.payload


@pytest.mark.asyncio
async def test_action_service_appends_derived_events_and_repository_visibility_matches() -> None:
    repos = make_repositories("memory")
    player = Player(
        id="player-a",
        room_id="room-1",
        display_name="player-a",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )
    room = GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[faction for faction in FactionId if faction != FactionId.ironCrown],
        current=EpochTurn(
            epoch=1,
            turn=1,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=900,
            phase_duration_ms=30_000,
        ),
        seed=42,
    )
    await repos.players.upsert(player)
    await repos.rooms.create(room)
    await repos.state.save_regions("room-1", _regions())

    service = ActionService(repos, FrozenClock(1000))
    await service.record_military_order(
        room_id="room-1",
        player_id="player-a",
        source_region="region-a",
        target_region="region-x",
        movement="attack",
        orders_text="attack at dawn",
        troops=81,
        request_id="req-military",
    )

    all_events = await repos.events.list_all("room-1")
    assert len(await repos.actions.list_by_turn("room-1", 1, 1)) == 1
    assert len(all_events) == 2

    expected = build_outbound_events_for_player(all_events, viewer_faction=FactionId.starlight)
    visible = await repos.events.list_visible_to_faction("room-1", FactionId.starlight)

    assert visible == expected
    assert visible[0].payload["scale"] == "large"
