from __future__ import annotations

from app.domain.enums import FactionId, TerrainKind
from app.domain.models import MapRegion
from app.game.visibility import adjacent_factions


def _region(
    region_id: str,
    owner: FactionId | None,
    center: tuple[float, float],
    *,
    neighbors: list[str] | None = None,
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
        neighbors=neighbors or [],
    )


def test_adjacent_factions_prefers_explicit_neighbors() -> None:
    regions = [
        _region("origin", FactionId.ironCrown, (0.0, 0.0), neighbors=["near_a", "near_b"]),
        _region("near_a", FactionId.starlight, (8.0, 0.0)),
        _region("near_b", FactionId.emerald, (9.0, 1.0)),
        _region("far", FactionId.ashen, (80.0, 80.0)),
    ]

    assert adjacent_factions("origin", regions) == {FactionId.starlight, FactionId.emerald}


def test_adjacent_factions_falls_back_to_distance_when_neighbors_missing() -> None:
    regions = [
        _region("origin", FactionId.ironCrown, (0.0, 0.0)),
        _region("near", FactionId.starlight, (29.0, 0.0)),
        _region("edge", FactionId.emerald, (30.1, 0.0)),
    ]

    assert adjacent_factions("origin", regions) == {FactionId.starlight}
