from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

from app.domain.models import MapRegion


def haversine_distance(
    origin: tuple[float, float],
    target: tuple[float, float],
) -> float:
    lat1, lng1 = map(radians, origin)
    lat2, lng2 = map(radians, target)
    lat_delta = lat2 - lat1
    lng_delta = lng2 - lng1
    a = sin(lat_delta / 2) ** 2 + cos(lat1) * cos(lat2) * sin(lng_delta / 2) ** 2
    return 2 * asin(min(1.0, sqrt(a)))


def build_region_neighbors(
    regions: list[MapRegion],
    *,
    max_neighbors: int = 6,
) -> dict[str, list[str]]:
    candidates = [region for region in regions if region.owner is not None]
    neighbor_map: dict[str, list[str]] = {}

    for origin in candidates:
        ordered = sorted(
            (
                haversine_distance(origin.center_lat_lng, target.center_lat_lng),
                target.id,
            )
            for target in candidates
            if target.id != origin.id
        )
        neighbor_map[origin.id] = [region_id for _, region_id in ordered[:max_neighbors]]

    return neighbor_map
