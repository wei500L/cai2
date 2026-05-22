from __future__ import annotations

import random
from typing import Literal

import app.game.initializer as game_initializer
from app.core.clock import Clock
from app.core.errors import (
    FactionAlreadyTakenError,
    InvalidActionError,
    InvalidPhaseError,
    NotAllPlayersReadyError,
    NotRoomHostError,
    PlayerNotFoundError,
    RoomFullError,
    RoomNotFoundError,
)
from app.core.ids import new_player_id, new_room_id
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.factions import all_faction_ids
from app.domain.models import EpochTurn, GameRoom, Player
from app.repositories.factory import Repositories

RoomMode = Literal["solo_1v7", "multi_4v4"]


class RoomService:
    def __init__(
        self,
        repos: Repositories,
        clock: Clock,
        *,
        max_solo_players: int = 1,
        max_multi_players: int = 4,
        total_factions: int = 8,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._max_solo_players = max_solo_players
        self._max_multi_players = max_multi_players
        self._total_factions = total_factions

    async def create_room(
        self,
        *,
        mode: RoomMode,
        host_display_name: str,
        seed: int | None = None,
    ) -> tuple[GameRoom, Player]:
        room_id = new_room_id()
        host = self._new_human_player(room_id=room_id, display_name=host_display_name)
        now_ms = self._clock.now_ms()
        room = GameRoom(
            id=room_id,
            status=RoomStatus.lobby,
            created_at_ms=now_ms,
            mode=mode,
            max_players=self._max_players_for_mode(mode),
            players=[host],
            ai_factions=[],
            current=EpochTurn(
                epoch=0,
                turn=0,
                phase=GamePhase.observe,
                arbitrate_phase=None,
                phase_started_at_ms=now_ms,
                phase_duration_ms=0,
            ),
            seed=seed if seed is not None else random.randrange(1, 2**31),
        )

        created_room = await self._repos.rooms.create(room)
        await self._repos.players.upsert(host)
        return created_room, host

    async def join_room(self, *, room_id: str, display_name: str) -> tuple[GameRoom, Player]:
        room = await self._get_room_or_raise(room_id)
        self._require_lobby(room)

        if len(room.players) >= room.max_players:
            raise RoomFullError(f"room {room_id} is full")

        player = self._new_human_player(room_id=room.id, display_name=display_name)
        room.players.append(player)

        await self._repos.rooms.update(room)
        await self._repos.players.upsert(player)
        return room, player

    async def leave_room(self, *, room_id: str, player_id: str) -> GameRoom:
        room = await self._get_room_or_raise(room_id)
        player = self._find_player(room, player_id)

        if room.status == RoomStatus.running:
            player.connected = False
            await self._repos.rooms.update(room)
            await self._repos.players.upsert(player)
            return room

        if room.status == RoomStatus.lobby:
            room.players = [candidate for candidate in room.players if candidate.id != player_id]
            player.room_id = None
            player.faction_id = None
            player.connected = False
            player.ready = False
            if not room.players:
                room.status = RoomStatus.aborted

            await self._repos.rooms.update(room)
            await self._repos.players.upsert(player)
            return room

        raise InvalidPhaseError(f"cannot leave room {room_id} while status={room.status}")

    async def select_faction(
        self,
        *,
        room_id: str,
        player_id: str,
        faction_id: FactionId,
    ) -> GameRoom:
        room = await self._get_room_or_raise(room_id)
        self._require_lobby(room)
        player = self._find_player(room, player_id)

        taken_by_other = any(
            candidate.id != player_id and candidate.faction_id == faction_id
            for candidate in room.players
        )
        if taken_by_other:
            raise FactionAlreadyTakenError(f"faction {faction_id} is already taken")

        player.faction_id = faction_id
        player.ready = False

        await self._repos.rooms.update(room)
        await self._repos.players.upsert(player)
        return room

    async def set_ready(self, *, room_id: str, player_id: str, ready: bool) -> GameRoom:
        room = await self._get_room_or_raise(room_id)
        self._require_lobby(room)
        player = self._find_player(room, player_id)

        if ready and player.faction_id is None:
            raise InvalidActionError("player must select a faction before readying")

        player.ready = ready

        await self._repos.rooms.update(room)
        await self._repos.players.upsert(player)
        return room

    async def start_game(self, *, room_id: str, requester_player_id: str) -> GameRoom:
        room = await self._get_room_or_raise(room_id)
        self._require_lobby(room)

        if self._host_player_id(room) != requester_player_id:
            raise NotRoomHostError("only the room host can start the game")

        if len(room.players) < room.max_players:
            raise InvalidPhaseError(
                f"room {room_id} needs {room.max_players} human players to start"
            )

        if not all(player.ready for player in room.players):
            raise NotAllPlayersReadyError("all human players must be ready")

        self._assign_ai_factions(room)
        room.status = RoomStatus.starting

        for player in room.players:
            await self._repos.players.upsert(player)

        initial_state = game_initializer.initialize_game_state(room, clock=self._clock)
        await self._repos.state.save_factions(room.id, initial_state.factions)
        await self._repos.state.save_regions(room.id, initial_state.regions)
        await self._repos.state.save_relationships(room.id, initial_state.relationships)
        await self._repos.state.save_treaties(room.id, initial_state.treaties)
        await self._repos.state.save_current_turn(room.id, initial_state.current_turn)

        room.current = initial_state.current_turn
        room.status = RoomStatus.running
        await self._repos.rooms.update(room)

        return room

    async def list_active_rooms(self) -> list[GameRoom]:
        return await self._repos.rooms.list_active()

    async def get_room(self, room_id: str) -> GameRoom:
        return await self._get_room_or_raise(room_id)

    def _new_human_player(self, *, room_id: str, display_name: str) -> Player:
        return Player(
            id=new_player_id(),
            room_id=room_id,
            display_name=display_name,
            kind=PlayerKind.human,
            faction_id=None,
            connected=True,
            joined_at_ms=self._clock.now_ms(),
            ready=False,
        )

    async def _get_room_or_raise(self, room_id: str) -> GameRoom:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            raise RoomNotFoundError(f"room {room_id} not found")
        return room

    def _require_lobby(self, room: GameRoom) -> None:
        if room.status != RoomStatus.lobby:
            raise InvalidPhaseError(f"room {room.id} is not in lobby")

    def _find_player(self, room: GameRoom, player_id: str) -> Player:
        for player in room.players:
            if player.id == player_id:
                return player
        raise PlayerNotFoundError(f"player {player_id} not found in room {room.id}")

    def _host_player_id(self, room: GameRoom) -> str | None:
        return room.players[0].id if room.players else None

    def _max_players_for_mode(self, mode: RoomMode) -> int:
        if mode == "solo_1v7":
            return self._max_solo_players
        if mode == "multi_4v4":
            return self._max_multi_players
        raise ValueError(f"unsupported room mode: {mode}")

    def _assign_ai_factions(self, room: GameRoom) -> None:
        faction_ids = list(all_faction_ids())[: self._total_factions]
        selected_factions = [player.faction_id for player in room.players if player.faction_id]

        if len(set(selected_factions)) != len(selected_factions):
            raise FactionAlreadyTakenError("human players contain duplicate factions")

        missing_human_factions = [player.id for player in room.players if player.faction_id is None]
        if missing_human_factions:
            raise NotAllPlayersReadyError("all human players must select factions")

        room.ai_factions = [
            faction_id for faction_id in faction_ids if faction_id not in selected_factions
        ]

        if len(selected_factions) + len(room.ai_factions) != self._total_factions:
            raise InvalidActionError("factions are not fully covered")
