from __future__ import annotations

import pytest

from app.domain.enums import FactionId, GamePhase, RoomStatus
from app.domain.models import EpochTurn, GameRoom
from app.domain.world_geometry import RegionCell, Terrain, WorldGeometry
from app.repositories.factory import make_repositories
from app.services.factions_meta_service import FactionMetaOverride, FactionsMetaService


@pytest.mark.asyncio
async def test_factions_meta_service_returns_default_eight_factions() -> None:
    repos = make_repositories("memory")
    service = FactionsMetaService(repos)

    factions = await service.get_factions_meta("room-1")

    assert [faction.id for faction in factions] == list(FactionId)
    assert len(factions) == 8
    assert {faction.speech_style for faction in factions} == {
        "aggressive",
        "cautious",
        "noble",
        "fervent",
        "mystic",
        "scholarly",
        "pragmatic",
        "shadowy",
    }
    assert factions[0].primary_color == "#8B1A1A"
    assert factions[-1].primary_color == "#6B5A1A"


@pytest.mark.asyncio
async def test_factions_meta_service_injects_capital_hex_id() -> None:
    repos = make_repositories("memory")
    room = _room_with_geometry()
    await repos.rooms.create(room)
    service = FactionsMetaService(repos)

    factions = await service.get_factions_meta(room.id)
    by_id = {faction.id: faction for faction in factions}

    assert by_id[FactionId.ironCrown].capital_hex_id == "hex-iron-capital"
    assert by_id[FactionId.starlight].capital_hex_id == "hex-starlight-capital"


@pytest.mark.asyncio
async def test_factions_meta_service_override_placeholder_can_replace_capital() -> None:
    class OverrideService(FactionsMetaService):
        async def _get_room_overrides(self, room_id: str):
            assert room_id == "room-1"
            return {FactionId.ironCrown: FactionMetaOverride(capital_hex_id="hex-override")}

    repos = make_repositories("memory")
    await repos.rooms.create(_room_with_geometry())
    service = OverrideService(repos)

    factions = await service.get_factions_meta("room-1")
    by_id = {faction.id: faction for faction in factions}

    assert by_id[FactionId.ironCrown].capital_hex_id == "hex-override"
    assert by_id[FactionId.starlight].capital_hex_id == "hex-starlight-capital"


def _room_with_geometry() -> GameRoom:
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[],
        ai_factions=[faction for faction in FactionId if faction != FactionId.ironCrown],
        current=EpochTurn(
            epoch=1,
            turn=1,
            phase=GamePhase.observe,
            arbitrate_phase=None,
            phase_started_at_ms=1_000,
            phase_duration_ms=30_000,
        ),
        seed=42,
        world_geometry=WorldGeometry(
            seed=42,
            hex_resolution=2,
            total_cells=3,
            capitals=[
                (FactionId.ironCrown, 10.0, 20.0),
                (FactionId.starlight, -4.0, 7.0),
            ],
            cells=[
                RegionCell(
                    lat=10.0,
                    lng=20.0,
                    hex_id="hex-iron-capital",
                    faction_id=FactionId.ironCrown,
                    terrain=Terrain.plains,
                    elevation=0.4,
                ),
                RegionCell(
                    lat=11.0,
                    lng=21.0,
                    hex_id="hex-iron-other",
                    faction_id=FactionId.ironCrown,
                    terrain=Terrain.mountain,
                    elevation=0.8,
                ),
                RegionCell(
                    lat=-4.0,
                    lng=7.0,
                    hex_id="hex-starlight-capital",
                    faction_id=FactionId.starlight,
                    terrain=Terrain.forest,
                    elevation=0.5,
                ),
            ],
        ),
    )
