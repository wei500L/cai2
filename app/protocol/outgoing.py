from __future__ import annotations

from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ArbitratePhase, FactionId, GamePhase, TerrainKind
from app.services.arc_builder import ArcSpec, RippleSpec


class BaseEnvelope(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    v: Literal[1] = 1
    id: str
    t: str
    ts: int
    seq: int
    p: Any


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
    server_time_ms: int


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


class RoomPlayerSnapshot(OutgoingPayloadModel):
    player_id: str
    display_name: str
    faction_id: FactionId | None = None
    connected: bool
    ready: bool
    ai_takeover: bool = False


class RoomSnapshotPayload(OutgoingPayloadModel):
    t: Literal["room.snapshot"] = Field("room.snapshot", exclude=True)
    room_id: str
    mode: Literal["solo_1v7", "multi_4v4"]
    status: str
    players: list[RoomPlayerSnapshot]
    ai_factions: list[FactionId]


class RoomPlayerTakeoverPayload(OutgoingPayloadModel):
    t: Literal["room.player_takeover"] = Field("room.player_takeover", exclude=True)
    room_id: str
    player_id: str
    faction_id: FactionId
    reason: Literal["disconnected_30s", "manual_leave"]


class RoomPlayerResumePayload(OutgoingPayloadModel):
    t: Literal["room.player_resume"] = Field("room.player_resume", exclude=True)
    room_id: str
    player_id: str
    faction_id: FactionId


class RoomStartPayload(OutgoingPayloadModel):
    t: Literal["room.start"] = Field("room.start", exclude=True)
    room_id: str
    initial_state: dict[str, Any]


class WorldGeometryCellPayload(OutgoingPayloadModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)
    hex_id: str = Field(max_length=32)
    faction_id: FactionId
    terrain: TerrainKind
    elevation: float = Field(ge=0.0, le=1.0)
    neighbors: list[int] = Field(default_factory=list)


class WorldGeometryFactionPayload(OutgoingPayloadModel):
    id: FactionId
    capital_hex_id: str
    capital_lat: float = Field(ge=-90.0, le=90.0)
    capital_lng: float = Field(ge=-180.0, le=180.0)


class WorldGeometryPayload(OutgoingPayloadModel):
    seed: int
    hex_resolution: int
    total_cells: int
    factions: list[WorldGeometryFactionPayload]
    cells: list[WorldGeometryCellPayload]


class WorldGeometryEvent(BaseEnvelope):
    t: Literal["room.world_geometry"] = Field("room.world_geometry", exclude=True)
    p: WorldGeometryPayload


class WorldLightingPayload(OutgoingPayloadModel):
    t: Literal["resolve.world_lighting"] = Field("resolve.world_lighting", exclude=True)
    room_id: str
    epoch: int
    turn: int
    sun_lat: float
    sun_lng: float
    day_color: str
    night_color: str
    phase_label: str


class WorldLightingEvent(BaseEnvelope):
    t: Literal["resolve.world_lighting"] = Field("resolve.world_lighting", exclude=True)
    p: WorldLightingPayload


class RegionEntryOut(OutgoingPayloadModel):
    id: str
    owner: FactionId | None = None
    resource_value: float
    development_level: float
    terrain: TerrainKind
    center_lat_lng: tuple[float, float]
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)
    hex_id: str = Field(max_length=32)
    min_garrison: int
    supply_lines: int
    neighbors: list[str] = Field(default_factory=list, max_length=8)
    resistance: float = Field(default=0.0, ge=0.0, le=1.0)
    captured_at_turn: int | None = None


class RoomFinishedPayload(OutgoingPayloadModel):
    t: Literal["room.finished"] = Field("room.finished", exclude=True)
    room_id: str
    winner: FactionId | None
    final_narration: str
    replay_available: bool


class PhaseChangePayload(OutgoingPayloadModel):
    t: Literal["phase.change"] = Field("phase.change", exclude=True)
    room_id: str
    epoch: int
    turn: int
    phase: GamePhase
    arbitrate_phase: ArbitratePhase | None = None
    phase_duration_ms: int
    phase_started_at_ms: int
    server_time_ms: int
    is_paused: bool | None = None


class TurnBeginPayload(OutgoingPayloadModel):
    t: Literal["turn.begin"] = Field("turn.begin", exclude=True)
    room_id: str
    epoch: int
    turn: int
    phase: GamePhase
    arbitrate_phase: ArbitratePhase | None = None
    phase_duration_ms: int
    phase_started_at_ms: int
    server_time_ms: int
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
    border_updates: list[dict[str, Any]] = Field(default_factory=list)


class ResolveStatsDiffPayload(OutgoingPayloadModel):
    t: Literal["resolve.stats_diff"] = Field("resolve.stats_diff", exclude=True)
    room_id: str
    epoch: int
    turn: int
    faction_stats: list[dict[str, Any]]
    relationship_changes: list[dict[str, Any]]


class DiplomaticArcsPayload(OutgoingPayloadModel):
    t: Literal["resolve.diplomatic_arcs"] = Field("resolve.diplomatic_arcs", exclude=True)
    room_id: str
    epoch: int
    turn: int
    arcs: list[ArcSpec]


class DiplomaticArcsEvent(BaseEnvelope):
    t: Literal["resolve.diplomatic_arcs"] = Field("resolve.diplomatic_arcs", exclude=True)
    p: DiplomaticArcsPayload


class RipplePayload(OutgoingPayloadModel):
    t: Literal["resolve.ripple"] = Field("resolve.ripple", exclude=True)
    room_id: str
    epoch: int
    turn: int
    ripples: list[RippleSpec]


class RippleEvent(BaseEnvelope):
    t: Literal["resolve.ripple"] = Field("resolve.ripple", exclude=True)
    p: RipplePayload


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
    event: dict[str, Any]
    private_message: dict[str, Any] | None = None
    faction_id: FactionId
    reaction: str
    target_faction: FactionId | None = None


class ReplayAIDiaryRevealPayload(OutgoingPayloadModel):
    t: Literal["replay.ai_diary_reveal"] = Field("replay.ai_diary_reveal", exclude=True)
    room_id: str
    faction_id: FactionId
    entries: list[dict[str, Any]]


class ReconnectCatchupPayload(OutgoingPayloadModel):
    """Reconnect catchup payload with missing envelopes in continuous seq order."""
    t: Literal["reconnect.catchup"] = Field("reconnect.catchup", exclude=True)
    room_id: str
    from_seq: int
    to_seq: int
    server_time_ms: int
    messages: list[dict[str, Any]]


class ReconnectSnapshotPayload(OutgoingPayloadModel):
    """Reconnect snapshot payload with the full game state.

    ``full_state`` contains room, current_turn, factions, regions with neighbors,
    relationships, treaties, recent_events, recent_messages, ai_thinking_state,
    border_tension, winner, and final_narration.
    """
    t: Literal["reconnect.snapshot"] = Field("reconnect.snapshot", exclude=True)
    room_id: str
    server_time_ms: int
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
    | RoomSnapshotPayload
    | RoomPlayerTakeoverPayload
    | RoomPlayerResumePayload
    | RoomStartPayload
    | RoomFinishedPayload
    | PhaseChangePayload
    | TurnBeginPayload
    | ActionBroadcastPayload
    | ActionPrivateBroadcastPayload
    | ActionRejectedPayload
    | WorldLightingPayload
    | ResolveEventsPayload
    | ResolveMapDiffPayload
    | ResolveStatsDiffPayload
    | DiplomaticArcsPayload
    | RipplePayload
    | AIThinkingPayload
    | AISpeakPayload
    | AIReactionPayload
    | ReplayAIDiaryRevealPayload
    | ReconnectCatchupPayload
    | ReconnectSnapshotPayload
    | ErrorMessagePayload,
    Field(discriminator="t"),
]
