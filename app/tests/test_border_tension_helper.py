from __future__ import annotations

from app.domain.enums import FactionId, RelationshipStatus, TerrainKind
from app.domain.models import MapRegion, Relationship
from app.services.settlement_service import compute_border_tension


def _region(region_id: str, owner: FactionId, lat: float, lng: float) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=50.0,
        development_level=0.8,
        terrain=TerrainKind.plains,
        center_lat_lng=(lat, lng),
        min_garrison=10,
        supply_lines=2,
    )


def test_compute_border_tension_uses_adjacent_owners_and_relationships() -> None:
    regions = [
        _region("region_00", FactionId.ironCrown, 0.0, 0.0),
        _region("region_01", FactionId.starlight, 0.0, 1.0),
    ]
    relationships = [
        Relationship(
            from_faction=FactionId.ironCrown,
            to_faction=FactionId.starlight,
            value=-80.0,
            status=RelationshipStatus.hostile,
            treaties=[],
            last_changed_turn=1,
        ),
        Relationship(
            from_faction=FactionId.starlight,
            to_faction=FactionId.ironCrown,
            value=-80.0,
            status=RelationshipStatus.hostile,
            treaties=[],
            last_changed_turn=1,
        ),
    ]

    tensions = compute_border_tension(regions, relationships)

    assert tensions == [
        {
            "between": ["ironCrown", "starlight"],
            "tension": 90,
            "visual_state": "critical",
        }
    ]
