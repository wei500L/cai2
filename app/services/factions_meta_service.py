from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.data.factions_default import DEFAULT_FACTION_META
from app.domain.enums import FactionId
from app.domain.faction_meta import FactionMeta, validate_complete_faction_meta
from app.domain.world_geometry import WorldGeometry
from app.repositories.factory import Repositories


@dataclass(frozen=True, slots=True)
class FactionMetaOverride:
    """Reserved extension point for room-specific static metadata overrides."""

    capital_hex_id: str | None = None


class FactionsMetaService:
    def __init__(self, repos: Repositories) -> None:
        self._repos = repos

    async def get_factions_meta(self, room_id: str) -> list[FactionMeta]:
        meta_by_id = {faction_id: meta for faction_id, meta in DEFAULT_FACTION_META.items()}
        overrides = await self._get_room_overrides(room_id)
        room = await self._repos.rooms.get(room_id)
        capital_hex_by_faction = (
            _capital_hex_by_faction(room.world_geometry)
            if room is not None and room.world_geometry is not None
            else {}
        )

        merged: dict[FactionId, FactionMeta] = {}
        for faction_id, meta in meta_by_id.items():
            override = overrides.get(faction_id)
            capital_hex_id = (
                override.capital_hex_id
                if override is not None and override.capital_hex_id is not None
                else capital_hex_by_faction.get(faction_id)
            )
            merged[faction_id] = meta.model_copy(update={"capital_hex_id": capital_hex_id})

        validate_complete_faction_meta(merged)
        return [merged[faction_id] for faction_id in FactionId]

    async def _get_room_overrides(
        self,
        room_id: str,
    ) -> Mapping[FactionId, FactionMetaOverride]:
        del room_id
        return {}


def _capital_hex_by_faction(world_geometry: WorldGeometry) -> dict[FactionId, str]:
    return {
        faction_id: _capital_hex_id(world_geometry, faction_id, capital_lat, capital_lng)
        for faction_id, capital_lat, capital_lng in world_geometry.capitals
    }


def _capital_hex_id(
    world_geometry: WorldGeometry,
    faction_id: FactionId,
    capital_lat: float,
    capital_lng: float,
) -> str:
    candidate_hex_id = ""
    best_distance = float("inf")
    for cell in world_geometry.cells:
        if cell.faction_id != faction_id:
            continue
        distance = abs(cell.lat - capital_lat) + abs(cell.lng - capital_lng)
        if distance < best_distance:
            best_distance = distance
            candidate_hex_id = cell.hex_id

    if candidate_hex_id:
        return candidate_hex_id

    for cell in world_geometry.cells:
        distance = abs(cell.lat - capital_lat) + abs(cell.lng - capital_lng)
        if distance < best_distance:
            best_distance = distance
            candidate_hex_id = cell.hex_id

    return candidate_hex_id
