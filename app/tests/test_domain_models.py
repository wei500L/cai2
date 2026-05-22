import pytest
from pydantic import TypeAdapter, ValidationError

from app.domain import (
    FACTION_META,
    AISpeechItem,
    FactionId,
    FactionState,
    FactionStatusKind,
    GameAction,
    GameEvent,
    GamePhase,
    IntelAction,
    LockAction,
    MapRegion,
    MessageVisibility,
    MilitaryAction,
    PrivateMessageAction,
    Relationship,
    RelationshipStatus,
    SettlementResult,
    SpeechAction,
    TerrainKind,
    TreatyAction,
    TreatyKind,
    VisibilityScope,
)
from app.domain.enums import EventKind, EventPriority
from app.domain.factions import PERSONALITY_KEYS


def _visibility() -> MessageVisibility:
    return MessageVisibility(scope=VisibilityScope.public, faction_ids=[])


def _action_payload(mode: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": f"action-{mode}",
        "room_id": "room-1",
        "epoch": 1,
        "turn": 2,
        "phase": GamePhase.action,
        "actor_player_id": "player-1",
        "actor_faction": FactionId.ironCrown,
        "created_at_ms": 1000,
        "visibility": _visibility(),
        "mode": mode,
    }
    payload.update(overrides)
    return payload


def test_faction_enum_contains_frontend_compatible_ids() -> None:
    assert [faction.value for faction in FactionId] == [
        "ironCrown",
        "starlight",
        "emerald",
        "ashen",
        "voidChurch",
        "aurora",
        "magma",
        "darkTide",
    ]
    assert set(FACTION_META) == set(FactionId)
    assert all(set(meta.personality) == PERSONALITY_KEYS for meta in FACTION_META.values())


@pytest.mark.parametrize(
    ("payload", "expected_type"),
    [
        (_action_payload("speech", content="hello", targets=[FactionId.starlight]), SpeechAction),
        (
            _action_payload(
                "private",
                content="secret",
                target_faction=FactionId.starlight,
            ),
            PrivateMessageAction,
        ),
        (
            _action_payload(
                "treaty",
                treaty_kind=TreatyKind.trade,
                target_factions=[FactionId.starlight],
                proposal_text="trade route",
            ),
            TreatyAction,
        ),
        (
            _action_payload(
                "military",
                source_region="r-1",
                target_region="r-2",
                movement="attack",
                orders_text="advance",
                troops=100,
            ),
            MilitaryAction,
        ),
        (
            _action_payload(
                "intel",
                target_faction=FactionId.starlight,
                intel_kind="spy",
                brief="watch border",
            ),
            IntelAction,
        ),
        (_action_payload("lock"), LockAction),
    ],
)
def test_game_action_discriminator_routes_by_mode(
    payload: dict[str, object], expected_type: type[object]
) -> None:
    action = TypeAdapter(GameAction).validate_python(payload)

    assert isinstance(action, expected_type)
    assert action.mode == payload["mode"]


def test_speech_action_rejects_content_over_400_chars() -> None:
    with pytest.raises(ValidationError):
        SpeechAction(**_action_payload("speech", content="x" * 401, targets=[]))


def test_relationship_rejects_value_outside_allowed_range() -> None:
    with pytest.raises(ValidationError):
        Relationship(
            from_faction=FactionId.ironCrown,
            to_faction=FactionId.starlight,
            value=200.0,
            status=RelationshipStatus.hostile,
            treaties=[],
            last_changed_turn=1,
        )


def test_faction_state_rejects_morale_outside_allowed_range() -> None:
    with pytest.raises(ValidationError):
        FactionState(
            id=FactionId.ironCrown,
            military=1.0,
            economy=1.0,
            diplomacy=1.0,
            culture=1.0,
            morale=2.0,
            total_power=5.0,
            status=FactionStatusKind.stable,
            eliminated_at_turn=None,
        )


def test_map_region_rejects_development_outside_allowed_range() -> None:
    with pytest.raises(ValidationError):
        MapRegion(
            id="region-1",
            owner=FactionId.ironCrown,
            resource_value=1.0,
            development_level=2.0,
            terrain=TerrainKind.plains,
            center_lat_lng=(12.0, 34.0),
            min_garrison=10,
            supply_lines=2,
        )


def test_game_event_payload_accepts_arbitrary_dict() -> None:
    event = GameEvent(
        id="event-1",
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.resolve,
        created_at_ms=1200,
        priority=EventPriority.P1,
        kind=EventKind.economy,
        actor_faction=None,
        target_faction=None,
        payload={"numbers": [1, 2, 3], "nested": {"ok": True}},
        narration="Economic update.",
        visibility=_visibility(),
    )

    assert event.payload["nested"] == {"ok": True}


def test_settlement_result_accepts_empty_lists_and_none_inputs() -> None:
    result = SettlementResult(
        room_id="room-1",
        epoch=1,
        turn=1,
        generated_at_ms=1300,
        relationship_deltas=None,
        treaty_decisions=[],
        battle_results=None,
        region_changes=[],
        faction_stat_changes=None,
        narration_events=[],
        ai_speeches=[
            AISpeechItem(
                faction_id=FactionId.starlight,
                kind="public",
                content="We propose stability.",
                target_faction=None,
            )
        ],
    )

    assert result.relationship_deltas == []
    assert result.battle_results == []
    assert result.faction_stat_changes == []
    assert len(result.ai_speeches) == 1
