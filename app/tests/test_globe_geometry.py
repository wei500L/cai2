from __future__ import annotations

import math
from collections import Counter

import numpy as np

from app.domain.factions import all_faction_ids
from app.domain.world_geometry import Terrain
from app.game.globe_geometry import (
    assign_factions_voronoi,
    assign_terrain,
    build_neighbors_on_sphere,
    cells_for_resolution,
    generate_fibonacci_sphere,
    generate_world_geometry,
    pick_capitals,
)


def test_cells_for_resolution_matches_expected_counts() -> None:
    assert cells_for_resolution(3) == 162
    assert cells_for_resolution(4) == 642
    assert cells_for_resolution(5) == 2562


def test_generate_fibonacci_sphere_passes_chi_square_uniformity() -> None:
    points = generate_fibonacci_sphere(642, seed=42)
    zs = np.array([math.sin(math.radians(lat)) for lat, _lng in points], dtype=float)
    counts, _ = np.histogram(zs, bins=36, range=(-1.0, 1.0))
    expected = len(points) / 36.0
    chi2 = float(np.sum((counts - expected) ** 2 / expected))
    p_value = _chi_square_sf(chi2, 35)

    assert p_value > 0.05


def test_assign_factions_voronoi_is_balanced_for_seven_capitals() -> None:
    cells = generate_fibonacci_sphere(642, seed=42)
    capitals = pick_capitals(42, list(all_faction_ids()))
    assigned = assign_factions_voronoi(cells, capitals)
    counts = Counter(assigned)

    assert len(counts) == 7
    assert max(counts.values()) / min(counts.values()) < 1.5


def test_build_neighbors_on_sphere_returns_exact_k_neighbors() -> None:
    cells = generate_fibonacci_sphere(642, seed=42)
    neighbors = build_neighbors_on_sphere(cells, k=6)

    assert len(neighbors) == 642
    assert all(len(row) == 6 for row in neighbors)
    assert all(len(row) == len(set(row)) for row in neighbors)
    assert all(index not in row for index, row in enumerate(neighbors))


def test_generate_world_geometry_is_fully_deterministic() -> None:
    first = generate_world_geometry(42, faction_ids=list(all_faction_ids()))
    second = generate_world_geometry(42, faction_ids=list(all_faction_ids()))

    assert first == second


def test_assign_terrain_covers_all_eight_terrains() -> None:
    cells = generate_fibonacci_sphere(642, seed=42)
    terrains = assign_terrain(cells, seed=42)
    counts = Counter(terrains)
    ocean_ratio = counts[Terrain.ocean] / len(terrains)

    assert set(counts) == set(Terrain)
    assert 0.20 <= ocean_ratio <= 0.35


def _chi_square_sf(x: float, k: int) -> float:
    a = 0.5 * k
    z = 0.5 * x
    return _regularized_gamma_q(a, z)


def _regularized_gamma_q(a: float, x: float) -> float:
    if x <= 0.0:
        return 1.0
    if x < a + 1.0:
        return 1.0 - _regularized_gamma_p_series(a, x)
    return _regularized_gamma_q_cf(a, x)


def _regularized_gamma_p_series(a: float, x: float) -> float:
    gln = math.lgamma(a)
    term = 1.0 / a
    total = term
    ap = a
    for _ in range(1, 500):
        ap += 1.0
        term *= x / ap
        total += term
        if abs(term) < abs(total) * 1e-14:
            break
    return total * math.exp(-x + a * math.log(x) - gln)


def _regularized_gamma_q_cf(a: float, x: float) -> float:
    gln = math.lgamma(a)
    b = x + 1.0 - a
    c = 1.0e30
    d = 1.0 / max(b, 1.0e-30)
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < 1.0e-30:
            d = 1.0e-30
        c = b + an / c
        if abs(c) < 1.0e-30:
            c = 1.0e-30
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-14:
            break
    return math.exp(-x + a * math.log(x) - gln) * h
