"""未来用 asyncpg / SQLAlchemy 2.x async 接入 PostgreSQL。"""

from __future__ import annotations

from collections.abc import Collection
from typing import Any

from app.domain.enums import FactionId
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
    EventLogRepository,
    GameStateRepository,
    MessageLogRepository,
    MessageRecord,
    PlayerRepository,
    ReplayRepository,
    RoomRepository,
    SettlementRepository,
)

class PostgresRoomRepository(RoomRepository):
    async def create(self, room: GameRoom) -> GameRoom:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get(self, room_id: str) -> GameRoom | None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def update(self, room: GameRoom) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_active(self) -> list[GameRoom]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def delete(self, room_id: str) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresPlayerRepository(PlayerRepository):
    async def upsert(self, player: Player) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get(self, player_id: str) -> Player | None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_room(self, room_id: str) -> list[Player]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresGameStateRepository(GameStateRepository):
    async def save_factions(self, room_id: str, factions: list[FactionState]) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_factions(self, room_id: str) -> list[FactionState]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def save_regions(self, room_id: str, regions: list[MapRegion]) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_regions(self, room_id: str) -> list[MapRegion]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def save_relationships(self, room_id: str, rels: list[Relationship]) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_relationships(self, room_id: str) -> list[Relationship]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def save_treaties(self, room_id: str, treaties: list[Treaty]) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_treaties(self, room_id: str) -> list[Treaty]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def save_current_turn(self, room_id: str, turn: EpochTurn) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_current_turn(self, room_id: str) -> EpochTurn | None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresActionLogRepository(ActionLogRepository):
    async def append(self, action: GameAction) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_room(self, room_id: str) -> list[GameAction]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameAction]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_player(self, room_id: str, player_id: str) -> list[GameAction]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def count_by_player_turn(
        self,
        room_id: str,
        player_id: str,
        epoch: int,
        turn: int,
        mode: str | None,
    ) -> int:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresMessageLogRepository(MessageLogRepository):
    async def append_message(self, message: MessageRecord) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_room(self, room_id: str) -> list[MessageRecord]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[MessageRecord]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_private_between(
        self,
        room_id: str,
        factions: Collection[FactionId],
    ) -> list[MessageRecord]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_public(
        self,
        room_id: str,
        epoch: int | None = None,
        turn: int | None = None,
    ) -> list[MessageRecord]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresEventLogRepository(EventLogRepository):
    def next_seq(self, room_id: str) -> int:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def append(self, event: GameEvent) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_turn(self, room_id: str, epoch: int, turn: int) -> list[GameEvent]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_visible_to_faction(
        self,
        room_id: str,
        faction_id: FactionId,
        since_ms: int = 0,
    ) -> list[GameEvent]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_all(self, room_id: str) -> list[GameEvent]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresSettlementRepository(SettlementRepository):
    async def save(self, result: SettlementResult) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get(self, room_id: str, epoch: int, turn: int) -> SettlementResult | None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def list_by_room(self, room_id: str) -> list[SettlementResult]:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")


class PostgresReplayRepository(ReplayRepository):
    async def save_replay(self, room_id: str, replay_dto: dict[str, Any]) -> None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get_replay(self, room_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("postgres adapter pending; see docs/PERSISTENCE_PLAN.md")
