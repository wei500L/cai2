from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.enums import FactionId


class Terrain(StrEnum):
    ocean = "ocean"
    plains = "plains"
    forest = "forest"
    mountain = "mountain"
    desert = "desert"
    tundra = "tundra"
    river = "river"
    fortress = "fortress"


@dataclass(slots=True, frozen=True)
class RegionCell:
    lat: float
    lng: float
    hex_id: str
    faction_id: FactionId
    terrain: Terrain
    elevation: float
    neighbors: list[int] = field(default_factory=list)


@dataclass(slots=True, frozen=True)
class WorldGeometry:
    seed: int
    hex_resolution: int
    total_cells: int
    capitals: list[tuple[FactionId, float, float]]
    cells: list[RegionCell]
