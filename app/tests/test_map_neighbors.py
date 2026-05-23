from __future__ import annotations

from random import Random

from app.domain.factions import all_faction_ids
from app.game.globe_geometry import build_neighbors_on_sphere
from app.game.map_init import build_initial_regions


def test_build_initial_regions_assigns_nearest_neighbors_deterministically() -> None:
    regions = build_initial_regions(list(all_faction_ids()), Random(42))

    assert len(regions) == 642
    assert [region.model_dump() for region in regions] == [
        region.model_dump() for region in build_initial_regions(list(all_faction_ids()), Random(42))
    ]

    region_ids = [region.id for region in regions]
    expected_neighbors = build_neighbors_on_sphere(
        [(region.lat, region.lng) for region in regions],
        k=6,
    )
    for region in regions:
        assert len(region.neighbors) == 6
        assert region.id not in region.neighbors
        assert len(region.neighbors) == len(set(region.neighbors))
        index = region_ids.index(region.id)
        expected_neighbor_ids = [
            region_ids[neighbor_index] for neighbor_index in expected_neighbors[index]
        ]
        assert region.neighbors == expected_neighbor_ids
