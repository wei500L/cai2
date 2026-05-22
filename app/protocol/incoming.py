from __future__ import annotations

from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import FactionId, TreatyKind


class IncomingPayloadModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)


class ConnAuthPayload(IncomingPayloadModel):
    t: Literal["conn.auth"] = Field("conn.auth", exclude=True)
    token: str
    client_version: str


class ConnPingPayload(IncomingPayloadModel):
    t: Literal["conn.ping"] = Field("conn.ping", exclude=True)
    client_ts: int


class RoomCreatePayload(IncomingPayloadModel):
    t: Literal["room.create"] = Field("room.create", exclude=True)
    mode: Literal["solo_1v7", "multi_4v4"]
    display_name: str
    seed: int | None = None


class RoomJoinPayload(IncomingPayloadModel):
    t: Literal["room.join"] = Field("room.join", exclude=True)
    room_id: str
    display_name: str


class RoomLeavePayload(IncomingPayloadModel):
    t: Literal["room.leave"] = Field("room.leave", exclude=True)
    room_id: str


class RoomSelectFactionPayload(IncomingPayloadModel):
    t: Literal["room.select_faction"] = Field("room.select_faction", exclude=True)
    room_id: str
    faction_id: FactionId


class RoomReadyPayload(IncomingPayloadModel):
    t: Literal["room.ready"] = Field("room.ready", exclude=True)
    room_id: str
    ready: bool


class ActionSpeakPayload(IncomingPayloadModel):
    t: Literal["action.speak"] = Field("action.speak", exclude=True)
    room_id: str
    mode: Literal["speech"]
    content: str
    targets: list[FactionId]
    metadata: dict[str, Any] | None = None


class ActionPrivatePayload(IncomingPayloadModel):
    t: Literal["action.private"] = Field("action.private", exclude=True)
    room_id: str
    target_faction: FactionId
    content: str
    metadata: dict[str, Any] | None = None


class ActionTreatyPayload(IncomingPayloadModel):
    t: Literal["action.treaty"] = Field("action.treaty", exclude=True)
    room_id: str
    treaty_kind: TreatyKind
    target_factions: list[FactionId]
    proposal_text: str


class ActionMilitaryPayload(IncomingPayloadModel):
    t: Literal["action.military"] = Field("action.military", exclude=True)
    room_id: str
    source_region: str
    target_region: str
    movement: Literal["move", "attack", "defend"]
    orders_text: str
    troops: int | None = None


class ActionIntelPayload(IncomingPayloadModel):
    t: Literal["action.intel"] = Field("action.intel", exclude=True)
    room_id: str
    target_faction: FactionId
    intel_kind: Literal["spy", "interrogate", "intercept"]
    brief: str


class ActionLockPayload(IncomingPayloadModel):
    t: Literal["action.lock"] = Field("action.lock", exclude=True)
    room_id: str


class ReconnectRequestPayload(IncomingPayloadModel):
    t: Literal["reconnect.request"] = Field("reconnect.request", exclude=True)
    room_id: str
    player_id: str
    last_seq: int
    session_token: str


IncomingMessage: TypeAlias = Annotated[
    ConnAuthPayload
    | ConnPingPayload
    | RoomCreatePayload
    | RoomJoinPayload
    | RoomLeavePayload
    | RoomSelectFactionPayload
    | RoomReadyPayload
    | ActionSpeakPayload
    | ActionPrivatePayload
    | ActionTreatyPayload
    | ActionMilitaryPayload
    | ActionIntelPayload
    | ActionLockPayload
    | ReconnectRequestPayload,
    Field(discriminator="t"),
]
