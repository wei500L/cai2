from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.core.errors import (
    FactionAlreadyTakenError,
    InvalidActionError,
    NotAllPlayersReadyError,
    NotRoomHostError,
    RoomFullError,
)
from app.domain.enums import FactionId, RoomStatus
from app.repositories.factory import Repositories, make_repositories
from app.services.room_service import RoomService


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(1000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


@pytest.fixture()
def service(repos: Repositories, clock: FrozenClock) -> RoomService:
    return RoomService(repos, clock)


async def _create_ready_multi_room(
    service: RoomService,
) -> tuple[object, list[object]]:
    room, host = await service.create_room(
        mode="multi_4v4",
        host_display_name="host",
        seed=42,
    )
    players = [host]
    for name in ("p2", "p3", "p4"):
        room, player = await service.join_room(room_id=room.id, display_name=name)
        players.append(player)

    for player, faction_id in zip(players, list(FactionId)[:4], strict=True):
        room = await service.select_faction(
            room_id=room.id,
            player_id=player.id,
            faction_id=faction_id,
        )
        room = await service.set_ready(room_id=room.id, player_id=player.id, ready=True)

    return room, players


@pytest.mark.asyncio
async def test_create_room_for_solo_and_multi_modes(service: RoomService) -> None:
    solo, solo_host = await service.create_room(
        mode="solo_1v7",
        host_display_name="solo-host",
        seed=7,
    )
    multi, multi_host = await service.create_room(
        mode="multi_4v4",
        host_display_name="multi-host",
        seed=8,
    )

    assert solo.status == RoomStatus.lobby
    assert solo.mode == "solo_1v7"
    assert solo.max_players == 1
    assert solo.seed == 7
    assert solo.players == [solo_host]
    assert solo.current.epoch == 0
    assert solo.current.turn == 0

    assert multi.status == RoomStatus.lobby
    assert multi.mode == "multi_4v4"
    assert multi.max_players == 4
    assert multi.players == [multi_host]


@pytest.mark.asyncio
async def test_join_room_until_full_then_raises(
    service: RoomService,
) -> None:
    solo, _ = await service.create_room(mode="solo_1v7", host_display_name="host")

    with pytest.raises(RoomFullError):
        await service.join_room(room_id=solo.id, display_name="extra")

    multi, _ = await service.create_room(mode="multi_4v4", host_display_name="host")
    for name in ("p2", "p3", "p4"):
        multi, _ = await service.join_room(room_id=multi.id, display_name=name)

    assert len(multi.players) == 4
    with pytest.raises(RoomFullError):
        await service.join_room(room_id=multi.id, display_name="p5")


@pytest.mark.asyncio
async def test_select_faction_and_duplicate_selection_raises(
    service: RoomService,
) -> None:
    room, host = await service.create_room(mode="multi_4v4", host_display_name="host")
    room, player = await service.join_room(room_id=room.id, display_name="p2")

    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )

    assert room.players[0].faction_id == FactionId.ironCrown
    with pytest.raises(FactionAlreadyTakenError):
        await service.select_faction(
            room_id=room.id,
            player_id=player.id,
            faction_id=FactionId.ironCrown,
        )


@pytest.mark.asyncio
async def test_player_switching_faction_releases_old_faction(
    service: RoomService,
) -> None:
    room, host = await service.create_room(mode="multi_4v4", host_display_name="host")
    room, player = await service.join_room(room_id=room.id, display_name="p2")

    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )
    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.starlight,
    )
    room = await service.select_faction(
        room_id=room.id,
        player_id=player.id,
        faction_id=FactionId.ironCrown,
    )

    by_id = {candidate.id: candidate for candidate in room.players}
    assert by_id[host.id].faction_id == FactionId.starlight
    assert by_id[player.id].faction_id == FactionId.ironCrown


@pytest.mark.asyncio
async def test_ready_requires_selected_faction(service: RoomService) -> None:
    room, host = await service.create_room(mode="solo_1v7", host_display_name="host")

    with pytest.raises(InvalidActionError):
        await service.set_ready(room_id=room.id, player_id=host.id, ready=True)


@pytest.mark.asyncio
async def test_set_ready_toggles_true_and_false(service: RoomService) -> None:
    room, host = await service.create_room(mode="solo_1v7", host_display_name="host")
    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )

    room = await service.set_ready(room_id=room.id, player_id=host.id, ready=True)
    assert room.players[0].ready is True

    room = await service.set_ready(room_id=room.id, player_id=host.id, ready=False)
    assert room.players[0].ready is False


@pytest.mark.asyncio
async def test_start_game_by_non_host_raises(service: RoomService) -> None:
    room, players = await _create_ready_multi_room(service)

    with pytest.raises(NotRoomHostError):
        await service.start_game(room_id=room.id, requester_player_id=players[1].id)


@pytest.mark.asyncio
async def test_start_game_before_all_players_ready_raises(service: RoomService) -> None:
    room, host = await service.create_room(mode="multi_4v4", host_display_name="host")
    players = [host]
    for name in ("p2", "p3", "p4"):
        room, player = await service.join_room(room_id=room.id, display_name=name)
        players.append(player)

    for player, faction_id in zip(players, list(FactionId)[:4], strict=True):
        room = await service.select_faction(
            room_id=room.id,
            player_id=player.id,
            faction_id=faction_id,
        )
    room = await service.set_ready(room_id=room.id, player_id=host.id, ready=True)

    with pytest.raises(NotAllPlayersReadyError):
        await service.start_game(room_id=room.id, requester_player_id=host.id)


@pytest.mark.asyncio
async def test_start_game_assigns_ai_factions_and_sets_running(
    service: RoomService,
) -> None:
    room, players = await _create_ready_multi_room(service)

    room = await service.start_game(room_id=room.id, requester_player_id=players[0].id)

    human_factions = {player.faction_id for player in room.players}
    ai_factions = set(room.ai_factions)
    assert room.status == RoomStatus.running
    assert len(room.players) == 4
    assert len(room.ai_factions) == 4
    assert human_factions.isdisjoint(ai_factions)
    assert human_factions | ai_factions == set(FactionId)


@pytest.mark.asyncio
async def test_start_game_solo_assigns_seven_ai_factions(
    service: RoomService,
) -> None:
    room, host = await service.create_room(mode="solo_1v7", host_display_name="host")
    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )
    room = await service.set_ready(room_id=room.id, player_id=host.id, ready=True)

    room = await service.start_game(room_id=room.id, requester_player_id=host.id)

    assert room.status == RoomStatus.running
    assert len(room.players) == 1
    assert len(room.ai_factions) == 7
    assert set(room.ai_factions) == set(FactionId) - {FactionId.ironCrown}


@pytest.mark.asyncio
async def test_leave_room_in_lobby_removes_player_and_releases_faction(
    service: RoomService,
) -> None:
    room, host = await service.create_room(mode="multi_4v4", host_display_name="host")
    room, player = await service.join_room(room_id=room.id, display_name="p2")
    room = await service.select_faction(
        room_id=room.id,
        player_id=host.id,
        faction_id=FactionId.ironCrown,
    )

    room = await service.leave_room(room_id=room.id, player_id=host.id)

    assert room.status == RoomStatus.lobby
    assert [candidate.id for candidate in room.players] == [player.id]
    room = await service.select_faction(
        room_id=room.id,
        player_id=player.id,
        faction_id=FactionId.ironCrown,
    )
    assert room.players[0].faction_id == FactionId.ironCrown


@pytest.mark.asyncio
async def test_leave_room_in_running_marks_disconnected(
    service: RoomService,
    repos: Repositories,
) -> None:
    room, host = await service.create_room(mode="solo_1v7", host_display_name="host")
    room.status = RoomStatus.running
    await repos.rooms.update(room)

    room = await service.leave_room(room_id=room.id, player_id=host.id)

    assert room.status == RoomStatus.running
    assert len(room.players) == 1
    assert room.players[0].id == host.id
    assert room.players[0].connected is False
