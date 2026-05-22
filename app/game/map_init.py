from __future__ import annotations

from random import Random

from app.domain.enums import FactionId, TerrainKind
from app.domain.models import MapRegion

REGIONS_PER_FACTION = 8
TOTAL_REGION_COUNT = 64

_REQUIRED_TERRAINS: tuple[TerrainKind, ...] = (
    TerrainKind.mountain,
    TerrainKind.plains,
    TerrainKind.fortress,
    TerrainKind.river,
)
_FILLER_TERRAINS: tuple[TerrainKind, ...] = (TerrainKind.desert, TerrainKind.plains)


def build_initial_regions(faction_ids: list[FactionId], rng: Random) -> list[MapRegion]:
    regions: list[MapRegion] = []

    for faction_index, faction_id in enumerate(faction_ids):
        terrains = _terrains_for_faction(rng)
        for local_index, terrain in enumerate(terrains):
            region_index = faction_index * REGIONS_PER_FACTION + local_index
            regions.append(
                MapRegion(
                    id=f"region_{region_index:02d}",
                    owner=faction_id,
                    resource_value=_resource_value(faction_id, rng),
                    development_level=round(rng.uniform(0.5, 1.0), 4),
                    terrain=terrain,
                    center_lat_lng=_center_lat_lng(faction_index, len(faction_ids), rng),
                    min_garrison=10,
                    supply_lines=rng.randint(1, 3),
                )
            )

    return regions


def _terrains_for_faction(rng: Random) -> list[TerrainKind]:
    terrains = list(_REQUIRED_TERRAINS)
    terrains.extend(rng.choice(_FILLER_TERRAINS) for _ in range(REGIONS_PER_FACTION - 4))
    rng.shuffle(terrains)
    return terrains


def _resource_value(faction_id: FactionId, rng: Random) -> float:
    base_value = rng.uniform(20.0, 80.0)
    if faction_id == FactionId.magma:
        base_value *= 1.25
    return round(base_value, 4)


def _center_lat_lng(
    faction_index: int,
    faction_count: int,
    rng: Random,
) -> tuple[float, float]:
    lon_width = 360.0 / faction_count
    lon_min = -180.0 + faction_index * lon_width
    lon_max = lon_min + lon_width
    lat = rng.uniform(-60.0, 60.0)
    lng = rng.uniform(lon_min + 3.0, lon_max - 3.0)
    return round(lat, 4), round(lng, 4)
