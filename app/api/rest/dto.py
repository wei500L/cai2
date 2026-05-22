from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, RootModel

from app.domain.enums import ArbitratePhase, FactionId, GamePhase, TreatyKind


class RestDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _request_id() -> str:
    return f"debug_{uuid4().hex[:12]}"


class CreateRoomRequest(RestDTO):
    mode: Literal["solo_1v7", "multi_4v4"]
    host_display_name: str
    seed: int | None = None


class JoinRoomRequest(RestDTO):
    display_name: str


class LeaveRoomRequest(RestDTO):
    player_id: str


class SelectFactionRequest(RestDTO):
    player_id: str
    faction_id: FactionId


class ReadyRequest(RestDTO):
    player_id: str
    ready: bool


class StartRequest(RestDTO):
    player_id: str


class SpeakRequest(RestDTO):
    player_id: str
    content: str
    targets: list[FactionId | str]
    request_id: str = Field(default_factory=_request_id)


class PrivateMessageRequest(RestDTO):
    player_id: str
    target_faction: FactionId | str
    content: str
    request_id: str = Field(default_factory=_request_id)


class TreatyRequest(RestDTO):
    player_id: str
    treaty_kind: TreatyKind | str
    target_factions: list[FactionId | str]
    proposal_text: str
    request_id: str = Field(default_factory=_request_id)


class MilitaryOrderRequest(RestDTO):
    player_id: str
    source_region: str
    target_region: str
    movement: Literal["move", "attack", "defend"]
    orders_text: str
    troops: int | None = None
    request_id: str = Field(default_factory=_request_id)


class IntelActionRequest(RestDTO):
    player_id: str
    target_faction: FactionId | str
    intel_kind: Literal["spy", "interrogate", "intercept"]
    brief: str
    request_id: str = Field(default_factory=_request_id)


class LockRequest(RestDTO):
    player_id: str
    request_id: str = Field(default_factory=_request_id)


class ForcePhaseRequest(RestDTO):
    phase: GamePhase
    arbitrate_phase: ArbitratePhase | None = None


class RunSettlementRequest(RestDTO):
    epoch: int
    turn: int


class CreateRoomResponse(RestDTO):
    room: dict[str, Any]
    host: dict[str, Any]


class JoinRoomResponse(RestDTO):
    room: dict[str, Any]
    player: dict[str, Any]


class LeaveRoomResponse(RestDTO):
    room: dict[str, Any]


class SelectFactionResponse(RestDTO):
    room: dict[str, Any]


class ReadyResponse(RestDTO):
    room: dict[str, Any]


class StartResponse(RestDTO):
    room: dict[str, Any]


class RoomStateResponse(RestDTO):
    room: dict[str, Any]
    factions: list[dict[str, Any]]
    regions: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    current_turn: dict[str, Any] | None


class ActionAckResponse(RestDTO):
    request_id: str
    accepted: bool
    action_id: str | None = None
    reason: str | None = None
    server_ts: int
    seq: int


class PhaseResponse(RestDTO):
    current_turn: dict[str, Any]


class SettlementResponse(RootModel[dict[str, Any]]):
    pass


class EventsResponse(RootModel[list[dict[str, Any]]]):
    pass


class MessagesResponse(RootModel[list[dict[str, Any]]]):
    pass


class ReplayResponse(RootModel[dict[str, Any]]):
    pass
