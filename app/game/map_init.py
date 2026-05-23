from __future__ import annotations

from random import Random

from app.domain.enums import FactionId, TerrainKind
from app.domain.models import MapRegion
from app.domain.world_geometry import WorldGeometry
from app.game.globe_geometry import generate_world_geometry
from app.game.map_neighbors import build_region_neighbors

REGIONS_PER_FACTION = 8
TOTAL_REGION_COUNT = 64

_REQUIRED_TERRAINS: tuple[TerrainKind, ...] = (
    TerrainKind.mountain,
    TerrainKind.plains,
    TerrainKind.fortress,
    TerrainKind.river,
)
_FILLER_TERRAINS: tuple[TerrainKind, ...] = (
    TerrainKind.desert,
    TerrainKind.plains,
)


def build_initial_regions(
    faction_ids: list[FactionId],
    rng: Random | int,
    hex_resolution: int = 4,
) -> list[MapRegion]:
    if hex_resolution == 0:
        return _build_legacy_regions(faction_ids, rng if isinstance(rng, Random) else Random(rng))

    seed = rng.getrandbits(32) if isinstance(rng, Random) else int(rng)
    geometry = generate_world_geometry(
        seed,
        hex_resolution=hex_resolution,
        faction_ids=faction_ids,
    )
    return build_regions_from_world_geometry(geometry)


def build_regions_from_world_geometry(geometry: WorldGeometry) -> list[MapRegion]:
    region_ids = [f"region_{index:05d}" for index in range(geometry.total_cells)]
    return [
        MapRegion(
            id=region_ids[index],
            owner=cell.faction_id,
            resource_value=_resource_value(cell.faction_id, cell.elevation, geometry.seed, index),
            development_level=_development_level(cell.elevation, geometry.seed, index),
            terrain=TerrainKind(cell.terrain.value),
            center_lat_lng=_project_lat_lng(cell.lat, cell.lng),
            lat=cell.lat,
            lng=cell.lng,
            hex_id=cell.hex_id,
            min_garrison=10,
            supply_lines=_supply_lines(cell.elevation, index),
            neighbors=[region_ids[neighbor_index] for neighbor_index in cell.neighbors],
        )
        for index, cell in enumerate(geometry.cells)
    ]


def _build_legacy_regions(faction_ids: list[FactionId], rng: Random) -> list[MapRegion]:
    regions: list[MapRegion] = []

    for faction_index, faction_id in enumerate(faction_ids):
        terrains = _terrains_for_faction(rng)
        for local_index, terrain in enumerate(terrains):
            region_index = faction_index * REGIONS_PER_FACTION + local_index
            lat, lng = _legacy_lat_lng(faction_index, len(faction_ids), rng)
            regions.append(
                MapRegion(
                    id=f"region_{region_index:02d}",
                    owner=faction_id,
                    resource_value=_legacy_resource_value(faction_id, rng),
                    development_level=round(rng.uniform(0.5, 1.0), 4),
                    terrain=terrain,
                    center_lat_lng=_project_lat_lng(lat, lng),
                    lat=lat,
                    lng=lng,
                    hex_id=f"H0_{region_index:05d}",
                    min_garrison=10,
                    supply_lines=rng.randint(1, 3),
                )
            )

    neighbor_map = build_region_neighbors(regions)
    return [
        region.model_copy(update={"neighbors": neighbor_map.get(region.id, [])}, deep=True)
        for region in regions
    ]


def _terrains_for_faction(rng: Random) -> list[TerrainKind]:
    terrains = list(_REQUIRED_TERRAINS)
    terrains.extend(rng.choice(_FILLER_TERRAINS) for _ in range(REGIONS_PER_FACTION - 4))
    rng.shuffle(terrains)
    return terrains


def _resource_value(faction_id: FactionId, elevation: float, seed: int, index: int) -> float:
    base = 24.0 + (1.0 - elevation) * 68.0
    wobble = Random((seed << 16) ^ index).uniform(-4.0, 4.0)
    if faction_id == FactionId.magma:
        base *= 1.18
    return round(max(8.0, min(120.0, base + wobble)), 4)


def _development_level(elevation: float, seed: int, index: int) -> float:
    wobble = Random((seed << 8) ^ (index * 17)).uniform(-0.08, 0.08)
    return round(max(0.0, min(1.5, 0.35 + (1.0 - elevation) * 0.85 + wobble)), 4)


def _supply_lines(elevation: float, index: int) -> int:
    return max(1, min(3, round(1 + elevation * 2.0 + (index % 2) * 0.25)))


def _project_lat_lng(lat: float, lng: float) -> tuple[float, float]:
    from math import cos, radians, sin

    x = lng * cos(radians(lat))
    y = 90.0 * sin(radians(lat))
    return round(x, 4), round(y, 4)


def _legacy_resource_value(faction_id: FactionId, rng: Random) -> float:
    base_value = rng.uniform(20.0, 80.0)
    if faction_id == FactionId.magma:
        base_value *= 1.25
    return round(base_value, 4)


def _legacy_lat_lng(
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
