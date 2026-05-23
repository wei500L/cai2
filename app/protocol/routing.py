from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.protocol.envelope import Envelope, parse_envelope
from app.protocol.errors import UnknownMessageTypeError
from app.protocol.explosion_events import ExplosionEvent, ScorchedDiffEvent
from app.protocol.incoming import (
    ActionIntelPayload,
    ActionLockPayload,
    ActionMilitaryPayload,
    ActionPrivatePayload,
    ActionSpeakPayload,
    ActionTreatyPayload,
    ConnAuthPayload,
    ConnPingPayload,
    ReconnectRequestPayload,
    RoomCreatePayload,
    RoomJoinPayload,
    RoomLeavePayload,
    RoomReadyPayload,
    RoomSelectFactionPayload,
)
from app.protocol.outgoing import (
    ActionBroadcastPayload,
    ActionPrivateBroadcastPayload,
    ActionRejectedPayload,
    AIReactionPayload,
    AISpeakPayload,
    AIThinkingPayload,
    ConnAuthFailPayload,
    ConnAuthOkPayload,
    ConnKickPayload,
    ConnPongPayload,
    DiplomaticArcsEvent,
    ErrorMessagePayload,
    PhaseChangePayload,
    ReconnectCatchupPayload,
    ReconnectSnapshotPayload,
    ReplayAIDiaryRevealPayload,
    ResolveEventsPayload,
    ResolveMapDiffPayload,
    ResolveStatsDiffPayload,
    RippleEvent,
    RoomCreatedPayload,
    RoomFinishedPayload,
    RoomJoinedPayload,
    RoomPlayerJoinPayload,
    RoomPlayerLeavePayload,
    RoomPlayerResumePayload,
    RoomPlayerTakeoverPayload,
    RoomSnapshotPayload,
    RoomStartPayload,
    TurnBeginPayload,
    WorldGeometryEvent,
    WorldLightingEvent,
)

INCOMING_PAYLOAD_TYPES: dict[str, type[BaseModel]] = {
    "conn.auth": ConnAuthPayload,
    "conn.ping": ConnPingPayload,
    "room.create": RoomCreatePayload,
    "room.join": RoomJoinPayload,
    "room.leave": RoomLeavePayload,
    "room.select_faction": RoomSelectFactionPayload,
    "room.ready": RoomReadyPayload,
    "action.speak": ActionSpeakPayload,
    "action.private": ActionPrivatePayload,
    "action.treaty": ActionTreatyPayload,
    "action.military": ActionMilitaryPayload,
    "action.intel": ActionIntelPayload,
    "action.lock": ActionLockPayload,
    "reconnect.request": ReconnectRequestPayload,
}


OUTGOING_PAYLOAD_TYPES: dict[str, type[BaseModel]] = {
    "conn.auth.ok": ConnAuthOkPayload,
    "conn.auth.fail": ConnAuthFailPayload,
    "conn.pong": ConnPongPayload,
    "conn.kick": ConnKickPayload,
    "room.created": RoomCreatedPayload,
    "room.joined": RoomJoinedPayload,
    "room.player_join": RoomPlayerJoinPayload,
    "room.player_leave": RoomPlayerLeavePayload,
    "room.snapshot": RoomSnapshotPayload,
    "room.player_takeover": RoomPlayerTakeoverPayload,
    "room.player_resume": RoomPlayerResumePayload,
    "room.start": RoomStartPayload,
    "room.world_geometry": WorldGeometryEvent,
    "room.finished": RoomFinishedPayload,
    "phase.change": PhaseChangePayload,
    "turn.begin": TurnBeginPayload,
    "action.broadcast": ActionBroadcastPayload,
    "action.private": ActionPrivateBroadcastPayload,
    "action.rejected": ActionRejectedPayload,
    "resolve.events": ResolveEventsPayload,
    "resolve.map_diff": ResolveMapDiffPayload,
    "resolve.stats_diff": ResolveStatsDiffPayload,
    "resolve.diplomatic_arcs": DiplomaticArcsEvent,
    "resolve.event.explosion": ExplosionEvent,
    "resolve.scorched_diff": ScorchedDiffEvent,
    "resolve.ripple": RippleEvent,
    "resolve.world_lighting": WorldLightingEvent,
    "ai.thinking": AIThinkingPayload,
    "ai.speak": AISpeakPayload,
    "ai.reaction": AIReactionPayload,
    "replay.ai_diary_reveal": ReplayAIDiaryRevealPayload,
    "reconnect.catchup": ReconnectCatchupPayload,
    "reconnect.snapshot": ReconnectSnapshotPayload,
    "error.message": ErrorMessagePayload,
}


def parse_incoming(raw: dict[str, Any]) -> Envelope[BaseModel]:
    message_type = raw.get("t")
    payload_model = INCOMING_PAYLOAD_TYPES.get(message_type)
    if payload_model is None:
        raise UnknownMessageTypeError(f"unknown incoming message type: {message_type!r}")
    return parse_envelope(raw, payload_model)
