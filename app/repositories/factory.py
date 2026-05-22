from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.repositories.base import (
    ActionLogRepository,
    EventLogRepository,
    GameStateRepository,
    MessageLogRepository,
    PlayerRepository,
    ReplayRepository,
    RoomRepository,
    SettlementRepository,
)
from app.repositories.memory import (
    MemoryActionLogRepository,
    MemoryEventLogRepository,
    MemoryGameStateRepository,
    MemoryMessageLogRepository,
    MemoryPlayerRepository,
    MemoryReplayRepository,
    MemoryRoomRepository,
    MemorySettlementRepository,
)


class Repositories(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    rooms: RoomRepository
    players: PlayerRepository
    state: GameStateRepository
    actions: ActionLogRepository
    messages: MessageLogRepository
    events: EventLogRepository
    settlements: SettlementRepository
    replays: ReplayRepository


def make_repositories(env: Literal["memory", "postgres"]) -> Repositories:
    if env == "memory":
        return Repositories(
            rooms=MemoryRoomRepository(),
            players=MemoryPlayerRepository(),
            state=MemoryGameStateRepository(),
            actions=MemoryActionLogRepository(),
            messages=MemoryMessageLogRepository(),
            events=MemoryEventLogRepository(),
            settlements=MemorySettlementRepository(),
            replays=MemoryReplayRepository(),
        )

    raise NotImplementedError("postgres backend not wired yet; use 'memory' in MVP")
