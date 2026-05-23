from __future__ import annotations

from types import SimpleNamespace

from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    RelationshipStatus,
    TerrainKind,
    VisibilityScope,
)
from app.domain.models import (
    BattleEvent,
    MapRegion,
    MessageVisibility,
    RegionChange,
    Relationship,
    SettlementResult,
)
from app.services.settlement_service import _build_map_diff


def _region(
    region_id: str,
    owner: FactionId | None,
    *,
    neighbors: list[str],
) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=1.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(0.0, 0.0),
        min_garrison=10,
        supply_lines=1,
        neighbors=neighbors,
    )


def _battle() -> BattleEvent:
    return BattleEvent(
        id="battle-1",
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=GamePhase.resolve,
        created_at_ms=1200,
        priority=EventPriority.P0,
        kind=EventKind.battle,
        actor_faction=FactionId.ironCrown,
        target_faction=FactionId.starlight,
        payload={},
        narration="battle",
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
        attacker=FactionId.ironCrown,
        defender=FactionId.starlight,
        region_id="region_b",
        atk_loss=1.0,
        def_loss=1.0,
        territory_captured=True,
        morale_shift=2.0,
    )


def test_build_map_diff_emits_border_updates_from_neighbors_and_relationships() -> None:
    input_state = SimpleNamespace(
        regions_snapshot=[
            _region("region_a", FactionId.ironCrown, neighbors=["region_b"]),
            _region("region_b", FactionId.starlight, neighbors=["region_a", "region_c"]),
            _region("region_c", FactionId.starlight, neighbors=["region_b"]),
        ],
        relationships_snapshot=[
            Relationship(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                value=-72.0,
                status=RelationshipStatus.hostile,
                treaties=[],
                last_changed_turn=1,
            ),
            Relationship(
                from_faction=FactionId.starlight,
                to_faction=FactionId.ironCrown,
                value=-68.0,
                status=RelationshipStatus.hostile,
                treaties=[],
                last_changed_turn=1,
            ),
        ],
    )
    result = SettlementResult(
        room_id="room-1",
        epoch=1,
        turn=2,
        generated_at_ms=1300,
        region_changes=[
            RegionChange(
                region_id="region_b",
                prev_owner=FactionId.starlight,
                new_owner=FactionId.ironCrown,
                transition="conquest",
            )
        ],
        battle_results=[_battle()],
        relationship_deltas=[],
        treaty_decisions=[],
        created_treaties=[],
        faction_stat_changes=[],
        narration_events=[],
        ai_speeches=[],
    )

    bundle = _build_map_diff(result, input_state)

    assert bundle["changes"][0]["animation_params"] == {
        "direction": "inward",
        "speed": 1.2,
        "particles": 48,
    }
    assert bundle["border_updates"] == [
        {
            "between": [FactionId.ironCrown, FactionId.starlight],
            "tension": 0.72,
            "visual_state": "war_frontline",
        }
    ]
