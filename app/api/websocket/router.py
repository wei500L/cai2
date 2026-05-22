from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.core.clock import Clock
from app.core.errors import DiplomacyError
from app.domain.enums import FactionId
from app.domain.models import GameEvent, Player
from app.protocol.envelope import Envelope, make_envelope
from app.protocol.outgoing import (
    ActionBroadcastPayload,
    ActionPrivateBroadcastPayload,
    ActionRejectedPayload,
    ConnAuthOkPayload,
    ConnPongPayload,
    PhaseChangePayload,
    ReconnectCatchupPayload,
    ReconnectSnapshotPayload,
    RoomCreatedPayload,
    RoomJoinedPayload,
    RoomPlayerLeavePayload,
)
from app.protocol.routing import parse_incoming
from app.repositories.factory import Repositories

_RECONNECT_CATCHUP_LIMIT = 50


class InboundRouter:
    def __init__(
        self,
        *,
        room_service: Any,
        action_service: Any,
        phase_service: Any,
        settlement_service: Any,
        repos: Repositories,
        clock: Clock,
    ) -> None:
        self._room_service = room_service
        self._action_service = action_service
        self._phase_service = phase_service
        self._settlement_service = settlement_service
        self._repos = repos
        self._clock = clock
        self._auth_tokens: dict[str, str] = {}

    async def handle_raw(self, player_id: str, raw: dict[str, Any]) -> dict[str, Any] | None:
        envelope = parse_incoming(raw)
        try:
            return await self._route(player_id, envelope)
        except DiplomacyError as exc:
            return self._rejected(envelope, exc)

    async def _route(
        self,
        player_id: str,
        envelope: Envelope[BaseModel],
    ) -> dict[str, Any] | None:
        payload = envelope.p

        if envelope.t == "conn.auth":
            self._auth_tokens[player_id] = payload.token
            return self._dump(
                "conn.auth.ok",
                ConnAuthOkPayload(
                    player_id=player_id,
                    display_name=player_id,
                    server_time_ms=self._clock.now_ms(),
                ),
            )

        if envelope.t == "conn.ping":
            return self._dump("conn.pong", ConnPongPayload(server_ts=self._clock.now_ms()))

        if envelope.t == "room.create":
            room, _host = await self._room_service.create_room(
                mode=payload.mode,
                host_display_name=payload.display_name,
                seed=payload.seed,
            )
            return self._dump(
                "room.created",
                RoomCreatedPayload(room_id=room.id, mode=room.mode),
            )

        if envelope.t == "room.join":
            room, joined_player = await self._room_service.join_room(
                room_id=payload.room_id,
                display_name=payload.display_name,
            )
            return self._dump(
                "room.joined",
                RoomJoinedPayload(
                    room_id=room.id,
                    room_snapshot=_room_snapshot(room, joined_player.id),
                ),
            )

        if envelope.t == "room.leave":
            room = await self._room_service.leave_room(
                room_id=payload.room_id,
                player_id=player_id,
            )
            return self._dump(
                "room.player_leave",
                RoomPlayerLeavePayload(room_id=room.id, player_id=player_id),
            )

        if envelope.t == "room.select_faction":
            room = await self._room_service.select_faction(
                room_id=payload.room_id,
                player_id=player_id,
                faction_id=payload.faction_id,
            )
            return self._dump(
                "room.joined",
                RoomJoinedPayload(room_id=room.id, room_snapshot=_room_snapshot(room, player_id)),
            )

        if envelope.t == "room.ready":
            room = await self._room_service.set_ready(
                room_id=payload.room_id,
                player_id=player_id,
                ready=payload.ready,
            )
            return self._dump(
                "room.joined",
                RoomJoinedPayload(room_id=room.id, room_snapshot=_room_snapshot(room, player_id)),
            )

        if envelope.t == "action.speak":
            ack = await self._action_service.record_speech(
                room_id=payload.room_id,
                player_id=player_id,
                content=payload.content,
                targets=payload.targets,
                request_id=envelope.id,
            )
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "action.private":
            ack = await self._action_service.record_private_message(
                room_id=payload.room_id,
                player_id=player_id,
                target_faction=payload.target_faction,
                content=payload.content,
                request_id=envelope.id,
            )
            return self._dump(
                "action.private",
                ActionPrivateBroadcastPayload(
                    room_id=payload.room_id,
                    event=ack.model_dump(mode="json"),
                ),
                seq=ack.seq,
            )

        if envelope.t == "action.treaty":
            ack = await self._action_service.record_treaty_request(
                room_id=payload.room_id,
                player_id=player_id,
                treaty_kind=payload.treaty_kind,
                target_factions=payload.target_factions,
                proposal_text=payload.proposal_text,
                request_id=envelope.id,
            )
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "action.military":
            ack = await self._action_service.record_military_order(
                room_id=payload.room_id,
                player_id=player_id,
                source_region=payload.source_region,
                target_region=payload.target_region,
                movement=payload.movement,
                orders_text=payload.orders_text,
                troops=payload.troops,
                request_id=envelope.id,
            )
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "action.intel":
            ack = await self._action_service.record_intel_action(
                room_id=payload.room_id,
                player_id=player_id,
                target_faction=payload.target_faction,
                intel_kind=payload.intel_kind,
                brief=payload.brief,
                request_id=envelope.id,
            )
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "action.lock":
            ack = await self._action_service.record_lock_action(
                room_id=payload.room_id,
                player_id=player_id,
                request_id=envelope.id,
            )
            before = await self._repos.state.get_current_turn(payload.room_id)
            current = await self._phase_service.maybe_advance_by_lock(payload.room_id)
            if before is None or before.phase != current.phase:
                return self._dump(
                    "phase.change",
                    PhaseChangePayload(
                        room_id=payload.room_id,
                        epoch=current.epoch,
                        turn=current.turn,
                        phase=current.phase,
                        arbitrate_phase=current.arbitrate_phase,
                        phase_duration_ms=current.phase_duration_ms,
                        phase_started_at_ms=current.phase_started_at_ms,
                    ),
                )
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "reconnect.request":
            return await _build_reconnect_payload(
                repos=self._repos,
                clock=self._clock,
                room_id=payload.room_id,
                player_id=payload.player_id,
                last_seq=payload.last_seq,
            )

        return None

    def _action_broadcast(self, room_id: str, ack: BaseModel) -> dict[str, Any]:
        return self._dump(
            "action.broadcast",
            ActionBroadcastPayload(room_id=room_id, event=ack.model_dump(mode="json")),
            seq=getattr(ack, "seq", None),
        )

    def _rejected(self, envelope: Envelope[BaseModel], exc: DiplomacyError) -> dict[str, Any]:
        room_id = getattr(envelope.p, "room_id", "")
        return self._dump(
            "action.rejected",
            ActionRejectedPayload(
                room_id=room_id,
                request_id=envelope.id,
                reason=str(exc),
                error_code=exc.__class__.__name__,
            ),
        )

    def _dump(
        self,
        message_type: str,
        payload: BaseModel,
        *,
        seq: int | None = None,
    ) -> dict[str, Any]:
        return make_envelope(message_type, payload, clock=self._clock, seq=seq).model_dump(
            mode="json"
        )


async def _build_reconnect_payload(
    *,
    repos: Repositories,
    clock: Clock,
    room_id: str,
    player_id: str,
    last_seq: int,
) -> dict[str, Any]:
    player = await repos.players.get(player_id)
    faction_id = _player_faction(player)
    visible_events = (
        await repos.events.list_visible_to_faction(room_id, faction_id)
        if faction_id is not None
        else []
    )
    catchup_events = visible_events[max(last_seq, 0) :]

    if len(catchup_events) <= _RECONNECT_CATCHUP_LIMIT:
        payload = ReconnectCatchupPayload(
            room_id=room_id,
            from_seq=last_seq,
            messages=[
                _event_message(index + last_seq + 1, event)
                for index, event in enumerate(catchup_events)
            ],
        )
        return make_envelope("reconnect.catchup", payload, clock=clock).model_dump(mode="json")

    full_state = await _room_full_state(repos, room_id)
    payload = ReconnectSnapshotPayload(
        room_id=room_id,
        full_state=full_state,
        seq=last_seq + len(catchup_events),
    )
    return make_envelope("reconnect.snapshot", payload, clock=clock).model_dump(mode="json")


def _player_faction(player: Player | None) -> FactionId | None:
    if player is None:
        return None
    return player.faction_id


def _event_message(seq: int, event: GameEvent) -> dict[str, Any]:
    return {"seq": seq, "event": event.model_dump(mode="json")}


async def _room_full_state(repos: Repositories, room_id: str) -> dict[str, Any]:
    current_turn = await repos.state.get_current_turn(room_id)
    room = await repos.rooms.get(room_id)
    if current_turn is None and room is not None:
        current_turn = room.current
    return {
        "factions": [
            faction.model_dump(mode="json") for faction in await repos.state.get_factions(room_id)
        ],
        "regions": [
            region.model_dump(mode="json") for region in await repos.state.get_regions(room_id)
        ],
        "relationships": [
            rel.model_dump(mode="json") for rel in await repos.state.get_relationships(room_id)
        ],
        "current_turn": current_turn.model_dump(mode="json") if current_turn is not None else None,
    }


def _room_snapshot(room: Any, current_player_id: str) -> dict[str, Any]:
    return {
        "room": room.model_dump(mode="json"),
        "current_player_id": current_player_id,
    }
