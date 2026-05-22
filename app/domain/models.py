from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ArbitratePhase, GamePhase, RelationshipStatus
from app.domain.factions import FactionId


class FactionState(BaseModel):
    model_config = ConfigDict(strict=True)

    faction_id: FactionId
    relationship: RelationshipStatus = RelationshipStatus.neutral
    power: int = 0


class PlayerState(BaseModel):
    model_config = ConfigDict(strict=True)

    player_id: str
    room_id: str
    display_name: str
    faction_id: FactionId | None = None
    joined_at_ms: int = 0


class RoomState(BaseModel):
    model_config = ConfigDict(strict=True)

    room_id: str
    created_at_ms: int
    phase: GamePhase = GamePhase.observe
    arbitrate_phase: ArbitratePhase | None = None
    players: list[PlayerState] = Field(default_factory=list)
    factions: list[FactionState] = Field(default_factory=list)
    turn: int = 0


class GameState(BaseModel):
    model_config = ConfigDict(strict=True)

    room: RoomState
    latest_message_id: str | None = None
    latest_action_id: str | None = None


class RecordedPlayerMessage(BaseModel):
    model_config = ConfigDict(strict=True)

    message_id: str
    room_id: str
    player_id: str
    content: str
    created_at_ms: int
    seq: int


class RecordedPlayerAction(BaseModel):
    model_config = ConfigDict(strict=True)

    action_id: str
    room_id: str
    player_id: str
    action_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at_ms: int = 0
    seq: int = 0

