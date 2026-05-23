from __future__ import annotations

from random import Random

from app.domain.factions import all_faction_ids
from app.game.map_init import build_initial_regions
from app.game.map_neighbors import haversine_distance


def test_build_initial_regions_assigns_nearest_neighbors_deterministically() -> None:
    regions = build_initial_regions(list(all_faction_ids()), Random(42))

    assert len(regions) == 64
    assert [region.model_dump() for region in regions] == [
        region.model_dump() for region in build_initial_regions(list(all_faction_ids()), Random(42))
    ]

    region_by_id = {region.id: region for region in regions}
    for region in regions:
        assert 4 <= len(region.neighbors) <= 6
        assert region.id not in region.neighbors
        assert len(region.neighbors) == len(set(region.neighbors))

        expected = sorted(
            (
                haversine_distance(region.center_lat_lng, other.center_lat_lng),
                other.id,
            )
            for other in regions
            if other.id != region.id
        )[:6]
        assert region.neighbors == [neighbor_id for _, neighbor_id in expected]
        for neighbor_id in region.neighbors:
            assert neighbor_id in region_by_id
