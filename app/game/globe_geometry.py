from __future__ import annotations

from math import atan2, cos, degrees, pi, radians, sin, sqrt, tau

import numpy as np

from app.domain.enums import FactionId
from app.domain.world_geometry import RegionCell, Terrain, WorldGeometry

_GOLDEN_ANGLE = pi * (3.0 - sqrt(5.0))


def generate_fibonacci_sphere(n: int, seed: int) -> list[tuple[float, float]]:
    """Return `n` deterministic latitude/longitude points on a Fibonacci sphere."""
    if n <= 0:
        return []

    points = np.empty((n, 2), dtype=float)
    rng = np.random.default_rng(_seed_u64(seed))
    lat_shift = float(rng.uniform(-0.35, 0.35))
    lng_shift = float(rng.uniform(-pi, pi))

    for index in range(n):
        y = 1.0 - 2.0 * ((index + 0.5) / n)
        y = float(np.clip(y + lat_shift / max(1, n), -1.0, 1.0))
        radius = sqrt(max(0.0, 1.0 - y * y))
        theta = _GOLDEN_ANGLE * index + lng_shift
        x = cos(theta) * radius
        z = sin(theta) * radius
        lat = degrees(atan2(y, sqrt(x * x + z * z)))
        lng = degrees(atan2(z, x))
        points[index] = (lat, _wrap_lng(lng))

    return [(float(lat), float(lng)) for lat, lng in points]


def cells_for_resolution(resolution: int) -> int:
    """Return the number of hex cells implied by a spherical resolution."""
    if resolution <= 0:
        return 64
    return 2 + 10 * (4 ** (resolution - 1))


def assign_factions_voronoi(
    cells: list[tuple[float, float]],
    capitals: list[tuple[float, float, FactionId] | tuple[FactionId, float, float]],
) -> list[FactionId]:
    """Assign each cell to the nearest capital by cosine distance."""
    if not capitals:
        return []

    normalized_capitals = [_normalize_capital(capital) for capital in capitals]
    capital_vectors = np.array(
        [_lat_lng_to_unit(lat, lng) for lat, lng, _ in normalized_capitals],
        dtype=float,
    )
    capital_ids = [faction_id for _, _, faction_id in normalized_capitals]
    cell_vectors = np.array([_lat_lng_to_unit(lat, lng) for lat, lng in cells], dtype=float)
    scores = cell_vectors @ capital_vectors.T
    best_indices = np.argmax(scores, axis=1)
    return [capital_ids[int(index)] for index in best_indices]


def pick_capitals(
    seed: int,
    faction_ids: list[FactionId],
) -> list[tuple[FactionId, float, float]]:
    """Choose seven evenly distributed capitals with a deterministic seed perturbation."""
    if not faction_ids:
        return []

    count = min(7, len(faction_ids))
    rng = np.random.default_rng(_seed_u64(seed))
    selected = list(faction_ids[:count])
    base_points = generate_fibonacci_sphere(count, seed ^ 0x9E3779B9)

    capitals: list[tuple[FactionId, float, float]] = []
    for index, faction_id in enumerate(selected):
        lat, lng = base_points[index]
        lat += float(rng.uniform(-4.0, 4.0))
        lng += float(rng.uniform(-9.0, 9.0))
        capitals.append((faction_id, _clamp_lat(lat), _wrap_lng(lng)))
    return capitals


def build_neighbors_on_sphere(cells: list[tuple[float, float]], k: int = 6) -> list[list[int]]:
    """Build the k nearest spherical neighbors for each cell using cosine distance."""
    if not cells:
        return []

    vectors = np.array([_lat_lng_to_unit(lat, lng) for lat, lng in cells], dtype=float)
    scores = vectors @ vectors.T
    np.fill_diagonal(scores, -np.inf)
    neighbor_count = min(k, max(0, len(cells) - 1))
    if neighbor_count <= 0:
        return [[] for _ in cells]

    neighbors: list[list[int]] = []
    for row in scores:
        candidate_indices = np.argpartition(row, len(row) - neighbor_count)[-neighbor_count:]
        ordered = sorted(candidate_indices, key=lambda col: (-float(row[col]), int(col)))
        neighbors.append([int(index) for index in ordered])
    return neighbors


def assign_terrain(cells: list[tuple[float, float]], seed: int) -> list[Terrain]:
    """Assign spherical terrain bands using deterministic 3D noise and latitude belts."""
    if not cells:
        return []

    _elevation, terrains = _terrain_profile(cells, seed)
    return terrains


def generate_world_geometry(
    seed: int,
    *,
    hex_resolution: int = 4,
    faction_ids: list[FactionId],
) -> WorldGeometry:
    """Generate a full spherical world geometry for the given factions."""
    if not faction_ids:
        raise ValueError("faction_ids cannot be empty")
    if hex_resolution <= 0:
        raise ValueError("hex_resolution must be positive for spherical geometry")

    total_cells = cells_for_resolution(hex_resolution)
    cells = generate_fibonacci_sphere(total_cells, seed)
    capitals = pick_capitals(seed, faction_ids)
    assigned_factions = assign_factions_voronoi(cells, capitals)
    elevation, terrains = _terrain_profile(cells, seed)
    neighbors = build_neighbors_on_sphere(cells, k=6)

    region_cells = [
        RegionCell(
            lat=float(lat),
            lng=float(lng),
            hex_id=f"H{hex_resolution}_{index:05d}",
            faction_id=assigned_factions[index],
            terrain=terrains[index],
            elevation=float(elevation[index]),
            neighbors=neighbors[index],
        )
        for index, (lat, lng) in enumerate(cells)
    ]
    return WorldGeometry(
        seed=seed,
        hex_resolution=hex_resolution,
        total_cells=total_cells,
        capitals=capitals,
        cells=region_cells,
    )


def _seed_u64(seed: int) -> int:
    return seed & ((1 << 63) - 1)


def _normalize_capital(
    capital: tuple[float, float, FactionId] | tuple[FactionId, float, float],
) -> tuple[float, float, FactionId]:
    first = capital[0]
    if isinstance(first, FactionId):
        faction_id, lat, lng = capital
        return float(lat), float(lng), faction_id
    lat, lng, faction_id = capital
    return float(lat), float(lng), faction_id


def _lat_lng_to_unit(lat: float, lng: float) -> np.ndarray:
    lat_r = radians(lat)
    lng_r = radians(lng)
    cos_lat = cos(lat_r)
    return np.array(
        [
            cos_lat * cos(lng_r),
            cos_lat * sin(lng_r),
            sin(lat_r),
        ],
        dtype=float,
    )


def _terrain_noise(vectors: np.ndarray, seed: int) -> np.ndarray:
    rng = np.random.default_rng(_seed_u64(seed))
    directions = rng.normal(size=(6, 3))
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    frequencies = np.array([1.3, 2.1, 3.4, 4.9, 6.2, 8.1], dtype=float)
    phases = rng.uniform(0.0, tau, size=6)
    weights = np.array([1.0, 0.7, 0.45, 0.3, 0.2, 0.15], dtype=float)

    raw = np.zeros(len(vectors), dtype=float)
    for direction, frequency, phase, weight in zip(
        directions,
        frequencies,
        phases,
        weights,
        strict=True,
    ):
        raw += weight * np.sin((vectors @ direction) * frequency + phase)
    return raw


def _feature_noise(vectors: np.ndarray, seed: int, scale: float) -> np.ndarray:
    rng = np.random.default_rng(_seed_u64(seed))
    direction = rng.normal(size=3)
    direction /= np.linalg.norm(direction)
    phase = float(rng.uniform(0.0, tau))
    return 0.5 + 0.5 * np.sin((vectors @ direction) * scale + phase)


def _terrain_profile(
    cells: list[tuple[float, float]],
    seed: int,
) -> tuple[np.ndarray, list[Terrain]]:
    latlng = np.array(cells, dtype=float)
    unit_vectors = np.array([_lat_lng_to_unit(lat, lng) for lat, lng in latlng], dtype=float)
    raw = _terrain_noise(unit_vectors, seed)
    elevation = _rank_to_unit_interval(raw)

    river_noise = _feature_noise(unit_vectors, seed ^ 0x51F15EED, 4)
    fortress_noise = _feature_noise(unit_vectors, seed ^ 0xC0FFEE11, 6)
    desert_noise = _feature_noise(unit_vectors, seed ^ 0xA11CE5, 5)
    tundra_noise = _feature_noise(unit_vectors, seed ^ 0x7A5E1A, 3)

    terrains: list[Terrain] = []
    for index, (lat, _lng) in enumerate(latlng):
        abs_lat = abs(float(lat))
        elev = float(elevation[index])
        if elev < 0.25:
            terrain = Terrain.ocean
        elif elev < 0.5:
            terrain = Terrain.plains
        elif elev < 0.75:
            terrain = Terrain.forest
        else:
            terrain = Terrain.mountain

        if terrain is not Terrain.ocean:
            if abs_lat >= 58.0 and elev < 0.75 and tundra_noise[index] > 0.58:
                terrain = Terrain.tundra
            elif abs_lat <= 22.0 and elev < 0.60 and desert_noise[index] > 0.60:
                terrain = Terrain.desert
            elif elev < 0.68 and river_noise[index] > 0.84:
                terrain = Terrain.river
            elif elev >= 0.68 and fortress_noise[index] > 0.83:
                terrain = Terrain.fortress

        terrains.append(terrain)

    return elevation, terrains


def _rank_to_unit_interval(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = (np.arange(len(values), dtype=float) + 0.5) / float(len(values))
    return ranks


def _clamp_lat(lat: float) -> float:
    return float(np.clip(lat, -90.0, 90.0))


def _wrap_lng(lng: float) -> float:
    wrapped = ((lng + 180.0) % 360.0) - 180.0
    return float(wrapped if wrapped != -180.0 else 180.0)
