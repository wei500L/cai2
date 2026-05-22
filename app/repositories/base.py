from __future__ import annotations

from collections.abc import Collection
from typing import Any, Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel, Field

from app.domain.enums import FactionId, GamePhase
from app.domain.models import (
    EpochTurn,
    FactionState,
    GameAction,
    GameEvent,
    GameRoom,
    MapRegion,
    MessageVisibility,
    Player,
    Relationship,
    SettlementResult,
    Treaty,
)

T = TypeVar("T")


class AsyncRepository(Protocol[T]):
    async def get(self, item_id: str) -> T | None:
        ...

    async def upsert(self, item_id: str, item: T) -> None:
        ...

    async def delete(self, item_id: str) -> None:
        ...

    async def list_all(self) -> list[T]:
        ...


class MessageRecord(BaseModel):
    id: str
    room_id: str
    epoch: int
    turn: int
    phase: GamePhase
    from_faction: FactionId
    to_factions: list[FactionId] = Field(default_factory=list)
    visibility: MessageVisibility
    content: str
    created_at_ms: int


@runtime_checkable
class RoomRepository(Protocol):
    async def create(self, room: GameRoom) -> GameRoom:
        ...

    async def get(self, room_id: str) -> GameRoom | None:
        ...

    async def update(self, room: GameRoom) -> None:
        ...

    async def list_active(self) -> list[GameRoom]:
        ...

    async def delete(self, room_id: str) -> None:
        ...


@runtime_checkable
class PlayerRepository(Protocol):
    async def upsert(self, player: Player) -> None:
        ...

    async def get(self, player_id: str) -> Player | None:
        ...

    async def list_by_room(self, room_id: str) -> list[Player]:
        ...


@runtime_checkable
class GameStateRepository(Protocol):
    async def save_factions(self, room_id: str, factions: list[FactionState]) -> None:
        ...

    async def get_factions(self, room_id: str) -> list[FactionState]:
        ...

    async def save_regions(self, room_id: str, regions: list[MapRegion]) -> None:
        ...

    async def get_regions(self, room_id: str) -> list[MapRegion]:
        ...

    async def save_relationships(self, room_id: str, rels: list[Relationship]) -> None:
        ...

    async def get_relationships(self, room_id: str) -> list[Relationship]:
        ...

    async def save_treaties(self, room_id: str, treaties: list[Treaty]) -> None:
        ...

    async def get_treaties(self, room_id: str) -> list[Treaty]:
        ...

    async def save_current_turn(self, room_id: str, turn: EpochTurn) -> None:
        ...

    async def get_current_turn(self, room_id: str) -> EpochTurn | None:
        ...


@runtime_checkable
class ActionLogRepository(Protocol):
    async def append(self, action: GameAction) -> None:
        ...

    async def list_by_room(self, room_id: str) -> list[GameAction]:
        ...

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameAction]:
        ...

    async def list_by_player(self, room_id: str, player_id: str) -> list[GameAction]:
        ...

    async def count_by_player_turn(
        self,
        room_id: str,
        player_id: str,
        epoch: int,
        turn: int,
        mode: str | None,
    ) -> int:
        ...


@runtime_checkable
class MessageLogRepository(Protocol):
    async def append_message(self, message: MessageRecord) -> None:
        ...

    async def list_by_room(self, room_id: str) -> list[MessageRecord]:
        ...

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[MessageRecord]:
        ...

    async def list_private_between(
        self,
        room_id: str,
        factions: Collection[FactionId],
    ) -> list[MessageRecord]:
        ...

    async def list_public(
        self,
        room_id: str,
        epoch: int | None = None,
        turn: int | None = None,
    ) -> list[MessageRecord]:
        ...


@runtime_checkable
class EventLogRepository(Protocol):
    def next_seq(self, room_id: str) -> int:
        ...

    async def append(self, event: GameEvent) -> None:
        ...

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameEvent]:
        ...

    async def list_visible_to_faction(
        self,
        room_id: str,
        faction_id: FactionId,
        since_ms: int = 0,
    ) -> list[GameEvent]:
        ...

    async def list_all(self, room_id: str) -> list[GameEvent]:
        ...


@runtime_checkable
class SettlementRepository(Protocol):
    async def save(self, result: SettlementResult) -> None:
        ...

    async def get(self, room_id: str, epoch: int, turn: int) -> SettlementResult | None:
        ...

    async def list_by_room(self, room_id: str) -> list[SettlementResult]:
        ...


@runtime_checkable
class ReplayRepository(Protocol):
    async def save_replay(self, room_id: str, replay_dto: dict[str, Any]) -> None:
        ...

    async def get_replay(self, room_id: str) -> dict[str, Any] | None:
        ...
