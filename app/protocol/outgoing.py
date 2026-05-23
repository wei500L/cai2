from __future__ import annotations

from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ArbitratePhase, FactionId, GamePhase


class OutgoingPayloadModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)


class ConnAuthOkPayload(OutgoingPayloadModel):
    t: Literal["conn.auth.ok"] = Field("conn.auth.ok", exclude=True)
    player_id: str
    display_name: str
    server_time_ms: int


class ConnAuthFailPayload(OutgoingPayloadModel):
    t: Literal["conn.auth.fail"] = Field("conn.auth.fail", exclude=True)
    reason: str


class ConnPongPayload(OutgoingPayloadModel):
    t: Literal["conn.pong"] = Field("conn.pong", exclude=True)
    server_ts: int


class ConnKickPayload(OutgoingPayloadModel):
    t: Literal["conn.kick"] = Field("conn.kick", exclude=True)
    reason: str


class RoomCreatedPayload(OutgoingPayloadModel):
    t: Literal["room.created"] = Field("room.created", exclude=True)
    room_id: str
    mode: Literal["solo_1v7", "multi_4v4"]


class RoomJoinedPayload(OutgoingPayloadModel):
    t: Literal["room.joined"] = Field("room.joined", exclude=True)
    room_id: str
    room_snapshot: dict[str, Any]


class RoomPlayerJoinPayload(OutgoingPayloadModel):
    t: Literal["room.player_join"] = Field("room.player_join", exclude=True)
    room_id: str
    player_id: str
    display_name: str
    faction_id: FactionId | None = None


class RoomPlayerLeavePayload(OutgoingPayloadModel):
    t: Literal["room.player_leave"] = Field("room.player_leave", exclude=True)
    room_id: str
    player_id: str


class RoomStartPayload(OutgoingPayloadModel):
    t: Literal["room.start"] = Field("room.start", exclude=True)
    room_id: str
    initial_state: dict[str, Any]


class PhaseChangePayload(OutgoingPayloadModel):
    t: Literal["phase.change"] = Field("phase.change", exclude=True)
    room_id: str
    epoch: int
    turn: int
    phase: GamePhase
    arbitrate_phase: ArbitratePhase | None = None
    phase_duration_ms: int
    phase_started_at_ms: int
    is_paused: bool | None = None


class TurnBeginPayload(OutgoingPayloadModel):
    t: Literal["turn.begin"] = Field("turn.begin", exclude=True)
    room_id: str
    epoch: int
    turn: int
    visible_snapshot: dict[str, Any]


class ActionBroadcastPayload(OutgoingPayloadModel):
    t: Literal["action.broadcast"] = Field("action.broadcast", exclude=True)
    room_id: str
    event: dict[str, Any]


class ActionPrivateBroadcastPayload(OutgoingPayloadModel):
    t: Literal["action.private"] = Field("action.private", exclude=True)
    room_id: str
    event: dict[str, Any]
    private_message: dict[str, Any] | None = None


class ActionRejectedPayload(OutgoingPayloadModel):
    t: Literal["action.rejected"] = Field("action.rejected", exclude=True)
    room_id: str
    request_id: str
    reason: str
    error_code: str


class ResolveEventsPayload(OutgoingPayloadModel):
    t: Literal["resolve.events"] = Field("resolve.events", exclude=True)
    room_id: str
    epoch: int
    turn: int
    events: list[dict[str, Any]]
    private_messages: list[dict[str, Any]] | None = None


class ResolveMapDiffPayload(OutgoingPayloadModel):
    t: Literal["resolve.map_diff"] = Field("resolve.map_diff", exclude=True)
    room_id: str
    epoch: int
    turn: int
    changes: list[dict[str, Any]]
    border_updates: list[dict[str, Any]]


class ResolveStatsDiffPayload(OutgoingPayloadModel):
    t: Literal["resolve.stats_diff"] = Field("resolve.stats_diff", exclude=True)
    room_id: str
    epoch: int
    turn: int
    faction_stats: list[dict[str, Any]]
    relationship_changes: list[dict[str, Any]]


class AIThinkingPayload(OutgoingPayloadModel):
    t: Literal["ai.thinking"] = Field("ai.thinking", exclude=True)
    room_id: str
    faction_id: FactionId
    progress: float = Field(ge=0.0, le=1.0)


class AISpeakPayload(OutgoingPayloadModel):
    t: Literal["ai.speak"] = Field("ai.speak", exclude=True)
    room_id: str
    event: dict[str, Any]
    private_message: dict[str, Any] | None = None


class AIReactionPayload(OutgoingPayloadModel):
    t: Literal["ai.reaction"] = Field("ai.reaction", exclude=True)
    room_id: str
    faction_id: FactionId
    reaction: str
    target_faction: FactionId | None = None


class ReconnectCatchupPayload(OutgoingPayloadModel):
    t: Literal["reconnect.catchup"] = Field("reconnect.catchup", exclude=True)
    room_id: str
    from_seq: int
    messages: list[dict[str, Any]]


class ReconnectSnapshotPayload(OutgoingPayloadModel):
    t: Literal["reconnect.snapshot"] = Field("reconnect.snapshot", exclude=True)
    room_id: str
    full_state: dict[str, Any]
    seq: int


class ErrorMessagePayload(OutgoingPayloadModel):
    t: Literal["error.message"] = Field("error.message", exclude=True)
    reason: str
    error_code: str
    request_id: str | None = None


OutgoingMessage: TypeAlias = Annotated[
    ConnAuthOkPayload
    | ConnAuthFailPayload
    | ConnPongPayload
    | ConnKickPayload
    | RoomCreatedPayload
    | RoomJoinedPayload
    | RoomPlayerJoinPayload
    | RoomPlayerLeavePayload
    | RoomStartPayload
    | PhaseChangePayload
    | TurnBeginPayload
    | ActionBroadcastPayload
    | ActionPrivateBroadcastPayload
    | ActionRejectedPayload
    | ResolveEventsPayload
    | ResolveMapDiffPayload
    | ResolveStatsDiffPayload
    | AIThinkingPayload
    | AISpeakPayload
    | AIReactionPayload
    | ReconnectCatchupPayload
    | ReconnectSnapshotPayload
    | ErrorMessagePayload,
    Field(discriminator="t"),
]
