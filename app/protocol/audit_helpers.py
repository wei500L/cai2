from __future__ import annotations

from app.domain.models import MapRegion


def ensure_region_has_neighbors(region: MapRegion) -> MapRegion:
    assert region.neighbors is not None
    assert len(region.neighbors) <= 8
    assert region.id not in region.neighbors
    assert len(region.neighbors) == len(set(region.neighbors))
    return region
