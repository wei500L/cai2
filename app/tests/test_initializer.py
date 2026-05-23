from __future__ import annotations

from collections import Counter

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import FactionId, GamePhase, RelationshipStatus, RoomStatus, TerrainKind
from app.domain.factions import all_faction_ids
from app.domain.models import EpochTurn, GameRoom, Relationship
from app.game.initializer import initialize_game_state
from app.repositories.factory import Repositories, make_repositories
from app.services.room_service import RoomService


def _room(seed: int) -> GameRoom:
    return GameRoom(
        id="room-test",
        status=RoomStatus.starting,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[],
        ai_factions=list(all_faction_ids())[1:],
        current=EpochTurn(
            epoch=0,
            turn=0,
            phase=GamePhase.observe,
            arbitrate_phase=None,
            phase_started_at_ms=1_000,
            phase_duration_ms=0,
        ),
        seed=seed,
    )


def test_initialize_game_state_is_deterministic_for_same_seed() -> None:
    clock = FrozenClock(12_345)
    first = initialize_game_state(_room(42), clock=clock)
    second = initialize_game_state(_room(42), clock=clock)

    assert [faction.model_dump() for faction in first.factions] == [
        faction.model_dump() for faction in second.factions
    ]
    assert [region.model_dump() for region in first.regions] == [
        region.model_dump() for region in second.regions
    ]
    assert [relationship.model_dump() for relationship in first.relationships] == [
        relationship.model_dump() for relationship in second.relationships
    ]


def test_initialize_game_state_changes_with_different_seed() -> None:
    clock = FrozenClock(12_345)
    first = initialize_game_state(_room(42), clock=clock)
    second = initialize_game_state(_room(43), clock=clock)

    assert [faction.model_dump() for faction in first.factions] != [
        faction.model_dump() for faction in second.factions
    ]
    assert [region.model_dump() for region in first.regions] != [
        region.model_dump() for region in second.regions
    ]
    assert [relationship.model_dump() for relationship in first.relationships] != [
        relationship.model_dump() for relationship in second.relationships
    ]


def test_initial_turn_is_epoch_one_turn_one_observe() -> None:
    state = initialize_game_state(_room(42), clock=FrozenClock(12_345))

    assert state.current_turn.epoch == 1
    assert state.current_turn.turn == 1
    assert state.current_turn.phase == GamePhase.observe
    assert state.current_turn.arbitrate_phase is None
    assert state.current_turn.phase_started_at_ms == 12_345
    assert state.current_turn.phase_duration_ms == 15_000
    assert state.treaties == []


def test_faction_initial_metrics_follow_baselines_and_power_formula() -> None:
    state = initialize_game_state(_room(42), clock=FrozenClock(12_345))
    factions = {faction.id: faction for faction in state.factions}

    assert set(factions) == set(FactionId)
    assert len(factions) == 8
    assert 114.0 <= factions[FactionId.ironCrown].military <= 126.0
    assert 1.25 <= factions[FactionId.ashen].morale <= 1.35

    for faction in factions.values():
        assert faction.status.value == "stable"
        assert faction.eliminated_at_turn is None
        assert 95.0 <= faction.economy <= 105.0
        assert 47.5 <= faction.diplomacy <= 52.5
        assert 28.5 <= faction.culture <= 31.5
        expected_power = round(
            faction.military * 0.35
            + faction.economy * 0.25
            + faction.diplomacy * 0.25
            + faction.culture * 0.15,
            4,
        )
        assert faction.total_power == pytest.approx(expected_power)


def test_regions_are_generated_for_all_factions_with_required_terrain() -> None:
    state = initialize_game_state(_room(42), clock=FrozenClock(12_345))

    assert len(state.regions) == 642
    assert [region.id for region in state.regions] == [
        f"region_{index:05d}" for index in range(642)
    ]

    counts = Counter(region.owner for region in state.regions)
    assert sum(counts.values()) == 642
    assert len(counts) == 7
    assert max(counts.values()) / min(counts.values()) < 1.5

    terrain_counts = Counter(region.terrain for region in state.regions)
    assert set(terrain_counts) == set(TerrainKind)

    for region in state.regions:
        assert region.owner is not None
        assert region.min_garrison == 10
        assert 1 <= region.supply_lines <= 3
        assert 0.0 <= region.development_level <= 1.5
        assert len(region.neighbors) == 6
        assert region.id not in region.neighbors
        assert len(region.neighbors) == len(set(region.neighbors))
        lat, lng = region.lat, region.lng
        assert -90.0 <= lat <= 90.0
        assert -180.0 <= lng <= 180.0
        projected_lat, projected_lng = region.center_lat_lng
        assert -180.0 <= projected_lat <= 180.0
        assert -90.0 <= projected_lng <= 90.0
        assert 8.0 <= region.resource_value <= 120.0
        assert region.hex_id is not None


def test_relationship_matrix_has_all_directions_and_forced_baselines() -> None:
    state = initialize_game_state(_room(42), clock=FrozenClock(12_345))

    assert len(state.relationships) == 56
    directions = {
        (relationship.from_faction, relationship.to_faction)
        for relationship in state.relationships
    }
    assert len(directions) == 56
    assert all(from_faction != to_faction for from_faction, to_faction in directions)

    relationships = {
        (relationship.from_faction, relationship.to_faction): relationship
        for relationship in state.relationships
    }

    _assert_relationship(
        relationships,
        FactionId.ashen,
        FactionId.ironCrown,
        RelationshipStatus.hostile,
        -50.0,
    )
    _assert_relationship(
        relationships,
        FactionId.starlight,
        FactionId.aurora,
        RelationshipStatus.friendly,
        40.0,
    )
    _assert_relationship(
        relationships,
        FactionId.emerald,
        FactionId.darkTide,
        RelationshipStatus.friendly,
        25.0,
    )
    _assert_relationship(
        relationships,
        FactionId.voidChurch,
        FactionId.ashen,
        RelationshipStatus.wary,
        -15.0,
    )

    for relationship in state.relationships:
        assert relationship.last_changed_turn == 0
        assert relationship.treaties == []
        _assert_status_matches_value(relationship.status, relationship.value)


@pytest.mark.asyncio
async def test_room_service_start_game_persists_initial_state_and_sets_running() -> None:
    clock = FrozenClock(1_000)
    repos: Repositories = make_repositories("memory")
    service = RoomService(repos, clock)

    room, host = await service.create_room(
        mode="solo_1v7",
        host_display_name="host",
        seed=42,
    )
    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )
    room = await service.set_ready(room_id=room.id, player_id=host.id, ready=True)

    room = await service.start_game(room_id=room.id, requester_player_id=host.id)

    assert room.status == RoomStatus.running
    assert room.current.epoch == 1
    assert room.current.turn == 1
    assert room.current.phase == GamePhase.observe
    assert len(await repos.state.get_factions(room.id)) == 8
    assert len(await repos.state.get_regions(room.id)) == 642
    assert len(await repos.state.get_relationships(room.id)) == 56
    assert await repos.state.get_treaties(room.id) == []
    assert await repos.state.get_current_turn(room.id) == room.current
    assert room.world_geometry is not None
    assert room.world_geometry.total_cells == 642
    assert len(room.world_geometry.capitals) == 7


def _assert_relationship(
    relationships: dict[tuple[FactionId, FactionId], Relationship],
    first: FactionId,
    second: FactionId,
    status: RelationshipStatus,
    value: float,
) -> None:
    for from_faction, to_faction in ((first, second), (second, first)):
        relationship = relationships[(from_faction, to_faction)]
        assert relationship.status == status
        assert relationship.value == value


def _assert_status_matches_value(status: RelationshipStatus, value: float) -> None:
    if value <= -40.0:
        assert status == RelationshipStatus.hostile
    elif value <= -10.0:
        assert status == RelationshipStatus.wary
    elif value >= 60.0:
        assert status == RelationshipStatus.allied
    elif value >= 20.0:
        assert status == RelationshipStatus.friendly
    else:
        assert status == RelationshipStatus.neutral
