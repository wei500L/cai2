from __future__ import annotations

import asyncio
from collections.abc import Collection, Iterable
from copy import deepcopy
from typing import Any, Generic, TypeVar, cast

from app.core.clock import Clock
from app.domain.enums import FactionId, RoomStatus, VisibilityScope
from app.domain.models import (
    EpochTurn,
    FactionState,
    GameAction,
    GameEvent,
    GameRoom,
    MapRegion,
    Player,
    Relationship,
    SettlementResult,
    Treaty,
)
from app.repositories.base import (
    ActionLogRepository,
    AsyncRepository,
    EventLogRepository,
    GameStateRepository,
    MessageLogRepository,
    MessageRecord,
    PlayerRepository,
    ReplayRepository,
    RoomRepository,
    SettlementRepository,
)

T = TypeVar("T")


def _copy(item: T) -> T:
    copier = getattr(item, "model_copy", None)
    if callable(copier):
        return cast(T, copier(deep=True))
    return deepcopy(item)


def _copy_list(items: Iterable[T]) -> list[T]:
    return [_copy(item) for item in items]


class MemoryRepository(Generic[T], AsyncRepository[T]):
    def __init__(self, items: Iterable[tuple[str, T]] | None = None) -> None:
        self._items: dict[str, T] = {key: _copy(value) for key, value in (items or [])}
        self._lock = asyncio.Lock()

    async def get(self, item_id: str) -> T | None:
        async with self._lock:
            item = self._items.get(item_id)
            return _copy(item) if item is not None else None

    async def upsert(self, item_id: str, item: T) -> None:
        async with self._lock:
            self._items[item_id] = _copy(item)

    async def delete(self, item_id: str) -> None:
        async with self._lock:
            self._items.pop(item_id, None)

    async def list_all(self) -> list[T]:
        async with self._lock:
            return _copy_list(self._items.values())


class MemoryRoomRepository(RoomRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._rooms: dict[str, GameRoom] = {}
        self._lock = asyncio.Lock()
        self._clock = clock

    async def create(self, room: GameRoom) -> GameRoom:
        async with self._lock:
            self._rooms[room.id] = room.model_copy(deep=True)
            return self._rooms[room.id].model_copy(deep=True)

    async def get(self, room_id: str) -> GameRoom | None:
        async with self._lock:
            room = self._rooms.get(room_id)
            return room.model_copy(deep=True) if room is not None else None

    async def update(self, room: GameRoom) -> None:
        async with self._lock:
            self._rooms[room.id] = room.model_copy(deep=True)

    async def list_active(self) -> list[GameRoom]:
        async with self._lock:
            inactive = {RoomStatus.finished, RoomStatus.aborted}
            return [
                room.model_copy(deep=True)
                for room in self._rooms.values()
                if room.status not in inactive
            ]

    async def delete(self, room_id: str) -> None:
        async with self._lock:
            self._rooms.pop(room_id, None)


class MemoryPlayerRepository(PlayerRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._players: dict[str, Player] = {}
        self._lock = asyncio.Lock()
        self._clock = clock

    async def upsert(self, player: Player) -> None:
        async with self._lock:
            self._players[player.id] = player.model_copy(deep=True)

    async def get(self, player_id: str) -> Player | None:
        async with self._lock:
            player = self._players.get(player_id)
            return player.model_copy(deep=True) if player is not None else None

    async def list_by_room(self, room_id: str) -> list[Player]:
        async with self._lock:
            return [
                player.model_copy(deep=True)
                for player in self._players.values()
                if player.room_id == room_id
            ]


class MemoryGameStateRepository(GameStateRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._factions: dict[str, list[FactionState]] = {}
        self._regions: dict[str, list[MapRegion]] = {}
        self._relationships: dict[str, list[Relationship]] = {}
        self._treaties: dict[str, list[Treaty]] = {}
        self._current_turns: dict[str, EpochTurn] = {}
        self._lock = asyncio.Lock()
        self._clock = clock

    async def save_factions(self, room_id: str, factions: list[FactionState]) -> None:
        async with self._lock:
            self._factions[room_id] = _copy_list(factions)

    async def get_factions(self, room_id: str) -> list[FactionState]:
        async with self._lock:
            return _copy_list(self._factions.get(room_id, []))

    async def save_regions(self, room_id: str, regions: list[MapRegion]) -> None:
        async with self._lock:
            self._regions[room_id] = _copy_list(regions)

    async def get_regions(self, room_id: str) -> list[MapRegion]:
        async with self._lock:
            return _copy_list(self._regions.get(room_id, []))

    async def save_relationships(self, room_id: str, rels: list[Relationship]) -> None:
        async with self._lock:
            self._relationships[room_id] = _copy_list(rels)

    async def get_relationships(self, room_id: str) -> list[Relationship]:
        async with self._lock:
            return _copy_list(self._relationships.get(room_id, []))

    async def save_treaties(self, room_id: str, treaties: list[Treaty]) -> None:
        async with self._lock:
            self._treaties[room_id] = _copy_list(treaties)

    async def get_treaties(self, room_id: str) -> list[Treaty]:
        async with self._lock:
            return _copy_list(self._treaties.get(room_id, []))

    async def save_current_turn(self, room_id: str, turn: EpochTurn) -> None:
        async with self._lock:
            self._current_turns[room_id] = turn.model_copy(deep=True)

    async def get_current_turn(self, room_id: str) -> EpochTurn | None:
        async with self._lock:
            turn = self._current_turns.get(room_id)
            return turn.model_copy(deep=True) if turn is not None else None


class MemoryActionLogRepository(ActionLogRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._actions: list[GameAction] = []
        self._lock = asyncio.Lock()
        self._clock = clock

    async def append(self, action: GameAction) -> None:
        async with self._lock:
            self._actions.append(_copy(action))

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameAction]:
        async with self._lock:
            return _copy_list(
                action
                for action in self._actions
                if action.room_id == room_id and action.epoch == epoch and action.turn == turn
            )

    async def list_by_player(self, room_id: str, player_id: str) -> list[GameAction]:
        async with self._lock:
            return _copy_list(
                action
                for action in self._actions
                if action.room_id == room_id and action.actor_player_id == player_id
            )

    async def count_by_player_turn(
        self,
        room_id: str,
        player_id: str,
        epoch: int,
        turn: int,
        mode: str | None,
    ) -> int:
        async with self._lock:
            return sum(
                1
                for action in self._actions
                if action.room_id == room_id
                and action.actor_player_id == player_id
                and action.epoch == epoch
                and action.turn == turn
                and (mode is None or action.mode == mode)
            )


class MemoryMessageLogRepository(MessageLogRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._messages: list[MessageRecord] = []
        self._lock = asyncio.Lock()
        self._clock = clock

    async def append_message(self, message: MessageRecord) -> None:
        async with self._lock:
            self._messages.append(message.model_copy(deep=True))

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[MessageRecord]:
        async with self._lock:
            return [
                message.model_copy(deep=True)
                for message in self._messages
                if message.room_id == room_id and message.epoch == epoch and message.turn == turn
            ]

    async def list_private_between(
        self,
        room_id: str,
        factions: Collection[FactionId],
    ) -> list[MessageRecord]:
        requested = set(factions)
        async with self._lock:
            return [
                message.model_copy(deep=True)
                for message in self._messages
                if message.room_id == room_id
                and message.visibility.scope != VisibilityScope.public
                and self._message_participants(message) <= requested
                and bool(self._message_participants(message))
            ]

    async def list_public(
        self,
        room_id: str,
        epoch: int | None = None,
        turn: int | None = None,
    ) -> list[MessageRecord]:
        async with self._lock:
            return [
                message.model_copy(deep=True)
                for message in self._messages
                if message.room_id == room_id
                and message.visibility.scope == VisibilityScope.public
                and (epoch is None or message.epoch == epoch)
                and (turn is None or message.turn == turn)
            ]

    @staticmethod
    def _message_participants(message: MessageRecord) -> set[FactionId]:
        return {message.from_faction, *message.to_factions, *message.visibility.faction_ids}


class MemoryEventLogRepository(EventLogRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._events: list[GameEvent] = []
        self._lock = asyncio.Lock()
        self._clock = clock

    async def append(self, event: GameEvent) -> None:
        async with self._lock:
            self._events.append(event.model_copy(deep=True))

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameEvent]:
        async with self._lock:
            return [
                event.model_copy(deep=True)
                for event in self._events
                if event.room_id == room_id and event.epoch == epoch and event.turn == turn
            ]

    async def list_visible_to_faction(
        self,
        room_id: str,
        faction_id: FactionId,
        since_ms: int = 0,
    ) -> list[GameEvent]:
        async with self._lock:
            return [
                event.model_copy(deep=True)
                for event in self._events
                if event.room_id == room_id
                and event.created_at_ms >= since_ms
                and self._is_visible_to(event, faction_id)
            ]

    async def list_all(self, room_id: str) -> list[GameEvent]:
        async with self._lock:
            return [
                event.model_copy(deep=True)
                for event in self._events
                if event.room_id == room_id
            ]

    @staticmethod
    def _is_visible_to(event: GameEvent, faction_id: FactionId) -> bool:
        if event.visibility.scope == VisibilityScope.public:
            return True
        return faction_id in event.visibility.faction_ids


class MemorySettlementRepository(SettlementRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._results: dict[tuple[str, int, int], SettlementResult] = {}
        self._lock = asyncio.Lock()
        self._clock = clock

    async def save(self, result: SettlementResult) -> None:
        async with self._lock:
            key = (result.room_id, result.epoch, result.turn)
            self._results[key] = result.model_copy(deep=True)

    async def get(self, room_id: str, epoch: int, turn: int) -> SettlementResult | None:
        async with self._lock:
            result = self._results.get((room_id, epoch, turn))
            return result.model_copy(deep=True) if result is not None else None

    async def list_by_room(self, room_id: str) -> list[SettlementResult]:
        async with self._lock:
            return [
                result.model_copy(deep=True)
                for result in self._results.values()
                if result.room_id == room_id
            ]


class MemoryReplayRepository(ReplayRepository):
    def __init__(self, clock: Clock | None = None) -> None:
        self._replays: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._clock = clock

    async def save_replay(self, room_id: str, replay_dto: dict[str, Any]) -> None:
        async with self._lock:
            self._replays[room_id] = deepcopy(replay_dto)

    async def get_replay(self, room_id: str) -> dict[str, Any] | None:
        async with self._lock:
            replay = self._replays.get(room_id)
            return deepcopy(replay) if replay is not None else None
