from __future__ import annotations

import asyncio
from typing import Any

from pydantic import BaseModel

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher, build_world_geometry_payload
from app.core.clock import Clock
from app.core.config import get_settings
from app.core.errors import DiplomacyError
from app.domain.enums import FactionId, GamePhase
from app.domain.models import GameEvent, Player
from app.domain.world_geometry import WorldGeometry
from app.game.map_neighbors import build_region_neighbors
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
from app.services.factions_meta_service import FactionsMetaService
from app.services.room_service import build_snapshot as build_room_snapshot
from app.services.settlement_service import compute_border_tension
from app.services.takeover_service import TakeoverService

_RECONNECT_CATCHUP_LIMIT = max(10, get_settings().reconnect_catchup_max)


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
        connection_manager: ConnectionManager | None = None,
        dispatcher: OutboundDispatcher | None = None,
        takeover_service: TakeoverService | None = None,
    ) -> None:
        self._room_service = room_service
        self._action_service = action_service
        self._phase_service = phase_service
        self._settlement_service = settlement_service
        self._repos = repos
        self._clock = clock
        self._connection_manager = connection_manager
        self._dispatcher = dispatcher
        self._takeover_service = takeover_service
        self._auth_tokens: dict[str, str] = {}
        self._settlement_tasks: set[asyncio.Task[None]] = set()

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
            await self._resume_existing_player(player_id)
            return self._dump(
                "conn.auth.ok",
                ConnAuthOkPayload(
                    player_id=player_id,
                    display_name=player_id,
                    server_time_ms=self._clock.now_ms(),
                ),
            )

        if envelope.t == "conn.ping":
            return self._dump("conn.pong", ConnPongPayload(server_time_ms=self._clock.now_ms()))

        if envelope.t == "room.create":
            room, _host = await self._room_service.create_room(
                mode=payload.mode,
                host_display_name=payload.display_name,
                seed=payload.seed,
                host_player_id=player_id,
            )
            await self._attach_and_snapshot(player_id, room.id)
            await self._dispatch_factions_meta(room.id)
            return self._dump(
                "room.created",
                RoomCreatedPayload(room_id=room.id, mode=room.mode),
            )

        if envelope.t == "room.join":
            room, joined_player = await self._room_service.join_room(
                room_id=payload.room_id,
                display_name=payload.display_name,
                player_id=player_id,
            )
            await self._attach_and_snapshot(joined_player.id, room.id)
            await self._dispatch_factions_meta(room.id)
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
            if any(candidate.id == player_id for candidate in room.players):
                if self._takeover_service is not None:
                    await self._takeover_service.on_manual_leave(room.id, player_id)
                elif self._dispatcher is not None:
                    await self._dispatcher.dispatch_room_snapshot(room.id)
            else:
                if self._connection_manager is not None:
                    await self._connection_manager.detach_from_room(player_id)
                await self._dispatch_room_snapshot(room.id)
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
            await self._dispatch_room_snapshot(room.id)
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
            await self._dispatch_room_snapshot(room.id)
            return self._dump(
                "room.joined",
                RoomJoinedPayload(room_id=room.id, room_snapshot=_room_snapshot(room, player_id)),
            )

        if envelope.t == "room.start":
            room = await self._room_service.start_game(
                room_id=payload.room_id,
                requester_player_id=player_id,
            )
            if self._dispatcher is not None:
                await self._dispatcher.dispatch_room_start(room.id)
                await self._dispatcher.dispatch_room_snapshot(room.id)
            return None

        if envelope.t == "action.speak":
            ack = await self._action_service.record_speech(
                room_id=payload.room_id,
                player_id=player_id,
                content=payload.content,
                targets=payload.targets,
                request_id=envelope.id,
            )
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "action.private":
            ack = await self._action_service.record_private_message(
                room_id=payload.room_id,
                player_id=player_id,
                target_faction=payload.target_faction,
                content=payload.content,
                request_id=envelope.id,
            )
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
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
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
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
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
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
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
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
                phase_payload = PhaseChangePayload(
                    room_id=payload.room_id,
                    epoch=current.epoch,
                    turn=current.turn,
                    phase=current.phase,
                    arbitrate_phase=current.arbitrate_phase,
                    phase_duration_ms=current.phase_duration_ms,
                    phase_started_at_ms=current.phase_started_at_ms,
                    server_time_ms=self._clock.now_ms(),
                )
                if self._dispatcher is not None:
                    await self._dispatcher.dispatch_phase_change(
                        payload.room_id,
                        phase_payload.model_dump(mode="json"),
                    )
                    self._schedule_settlement_if_needed(payload.room_id, current)
                    return None
                self._schedule_settlement_if_needed(payload.room_id, current)
                return self._dump(
                    "phase.change",
                    phase_payload,
                )
            if await self._dispatch_action_events(payload.room_id, ack.action_id):
                return None
            return self._action_broadcast(payload.room_id, ack)

        if envelope.t == "reconnect.request":
            outbound = await _build_reconnect_payload(
                repos=self._repos,
                clock=self._clock,
                room_id=payload.room_id,
                player_id=payload.player_id,
                last_seq=payload.last_seq,
            )
            if self._dispatcher is not None:
                if outbound["t"] == "reconnect.snapshot":
                    await self._dispatcher.dispatch_reconnect_snapshot(
                        player_id,
                        outbound["p"],
                    )
                else:
                    await self._dispatcher.dispatch_reconnect_catchup(
                        player_id,
                        outbound["p"],
                    )
                return None
            return outbound

        return None

    def _schedule_settlement_if_needed(self, room_id: str, current: Any) -> None:
        if current.phase != GamePhase.resolve or self._settlement_service is None:
            return

        async def run() -> None:
            if self._dispatcher is not None:
                await self._dispatcher.dispatch_ai_thinking(room_id)
            bundle = await self._settlement_service.run_turn_settlement(
                room_id,
                current.epoch,
                current.turn,
            )
            if self._dispatcher is not None:
                await self._dispatcher.dispatch_resolve_bundle(room_id, bundle)

        task = asyncio.create_task(run())
        self._settlement_tasks.add(task)
        task.add_done_callback(self._settlement_tasks.discard)

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

    async def _resume_existing_player(self, player_id: str) -> None:
        player = await self._repos.players.get(player_id)
        if player is None or player.room_id is None:
            return
        if self._connection_manager is not None:
            await self._connection_manager.attach_to_room(player_id, player.room_id)
        if self._takeover_service is not None:
            await self._takeover_service.on_reconnect(player.room_id, player_id)
        else:
            await self._dispatch_room_snapshot(player.room_id)

    async def _attach_and_snapshot(self, player_id: str, room_id: str) -> None:
        if self._connection_manager is not None:
            await self._connection_manager.attach_to_room(player_id, room_id)
        if self._takeover_service is not None:
            await self._takeover_service.on_reconnect(room_id, player_id)
        else:
            await self._dispatch_room_snapshot(room_id)

    async def _dispatch_room_snapshot(self, room_id: str) -> None:
        if self._dispatcher is not None:
            await self._dispatcher.dispatch_room_snapshot(room_id)

    async def _dispatch_factions_meta(self, room_id: str) -> None:
        if self._dispatcher is not None:
            await self._dispatcher.dispatch_factions_meta(room_id)

    async def _dispatch_action_events(self, room_id: str, action_id: str | None) -> bool:
        if self._dispatcher is None or action_id is None:
            return False
        events = [
            event
            for event in await self._repos.events.list_all(room_id)
            if event.payload.get("action_id") == action_id
        ]
        for event in events:
            dumped = event.model_dump(mode="json")
            message_type = (
                "action.private" if dumped.get("kind") == "private" else "action.broadcast"
            )
            payload: BaseModel
            if message_type == "action.private":
                payload = ActionPrivateBroadcastPayload(room_id=room_id, event=dumped)
            else:
                payload = ActionBroadcastPayload(room_id=room_id, event=dumped)
            await self._dispatcher.dispatch_to_room(
                room_id,
                self._dump(message_type, payload, seq=getattr(event, "seq", None)),
            )
        return True


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
    room = await repos.rooms.get(room_id)
    if room is None:
        full_state = await _room_full_state(repos, room_id, faction_id=faction_id, clock=clock)
        payload = ReconnectSnapshotPayload(
            room_id=room_id,
            server_time_ms=clock.now_ms(),
            full_state=full_state,
            seq=last_seq,
        )
        envelope = make_envelope(
            "reconnect.snapshot",
            payload,
            clock=clock,
            seq=last_seq,
        ).model_dump(mode="json")
        envelope["p"]["factions_meta"] = await _factions_meta_payload(repos, room_id)
        return envelope

    current_seq = repos.events.current_seq(room_id)
    gap = current_seq - last_seq

    if faction_id is None or gap <= 0 or gap > _RECONNECT_CATCHUP_LIMIT:
        full_state = await _room_full_state(repos, room_id, faction_id=faction_id, clock=clock)
        payload = ReconnectSnapshotPayload(
            room_id=room_id,
            server_time_ms=clock.now_ms(),
            full_state=full_state,
            seq=current_seq,
        )
        envelope = make_envelope(
            "reconnect.snapshot",
            payload,
            clock=clock,
            seq=current_seq,
        ).model_dump(mode="json")
        envelope["p"]["factions_meta"] = await _factions_meta_payload(repos, room_id)
        if room is not None and room.world_geometry is not None:
            envelope["p"]["world_geometry"] = _world_geometry_payload(room.world_geometry)
        return envelope

    visible_events = await repos.events.list_visible_to_faction(
        room_id,
        faction_id,
        since_seq=last_seq + 1,
    )
    if len(visible_events) != gap:
        full_state = await _room_full_state(repos, room_id, faction_id=faction_id, clock=clock)
        payload = ReconnectSnapshotPayload(
            room_id=room_id,
            server_time_ms=clock.now_ms(),
            full_state=full_state,
            seq=current_seq,
        )
        envelope = make_envelope(
            "reconnect.snapshot",
            payload,
            clock=clock,
            seq=current_seq,
        ).model_dump(mode="json")
        envelope["p"]["factions_meta"] = await _factions_meta_payload(repos, room_id)
        if room is not None and room.world_geometry is not None:
            envelope["p"]["world_geometry"] = _world_geometry_payload(room.world_geometry)
        return envelope

    ordered_events = sorted(
        visible_events,
        key=lambda event: (
            event.seq if event.seq is not None else 0,
            event.created_at_ms,
            event.id,
        ),
    )
    expected_seq = last_seq + 1
    if any(event.seq != expected_seq + index for index, event in enumerate(ordered_events)):
        full_state = await _room_full_state(repos, room_id, faction_id=faction_id, clock=clock)
        payload = ReconnectSnapshotPayload(
            room_id=room_id,
            server_time_ms=clock.now_ms(),
            full_state=full_state,
            seq=current_seq,
        )
        envelope = make_envelope(
            "reconnect.snapshot",
            payload,
            clock=clock,
            seq=current_seq,
        ).model_dump(mode="json")
        envelope["p"]["factions_meta"] = await _factions_meta_payload(repos, room_id)
        if room is not None and room.world_geometry is not None:
            envelope["p"]["world_geometry"] = _world_geometry_payload(room.world_geometry)
        return envelope

    payload = ReconnectCatchupPayload(
        room_id=room_id,
        from_seq=expected_seq,
        to_seq=current_seq,
        server_time_ms=clock.now_ms(),
        messages=[_event_envelope(event, clock=clock) for event in ordered_events],
    )
    envelope = make_envelope("reconnect.catchup", payload, clock=clock, seq=current_seq).model_dump(
        mode="json"
    )
    envelope["p"]["factions_meta"] = await _factions_meta_payload(repos, room_id)
    if room is not None and room.world_geometry is not None:
        envelope["p"]["world_geometry"] = _world_geometry_payload(room.world_geometry)
    return envelope


def _player_faction(player: Player | None) -> FactionId | None:
    if player is None:
        return None
    return player.faction_id


def _event_envelope(event: GameEvent, *, clock: Clock) -> dict[str, Any]:
    return make_envelope(
        "action.broadcast",
        {"room_id": event.room_id, "event": event.model_dump(mode="json")},
        clock=clock,
        seq=event.seq,
    ).model_dump(mode="json")


async def _room_full_state(
    repos: Repositories,
    room_id: str,
    *,
    faction_id: FactionId | None,
    clock: Clock,
) -> dict[str, Any]:
    current_turn = await repos.state.get_current_turn(room_id)
    room = await repos.rooms.get(room_id)
    if current_turn is None and room is not None:
        current_turn = room.current

    factions = await repos.state.get_factions(room_id)
    regions = await repos.state.get_regions(room_id)
    relationships = await repos.state.get_relationships(room_id)
    treaties = await repos.state.get_treaties(room_id)
    visible_events = (
        await repos.events.list_visible_to_faction(room_id, faction_id, since_seq=0)
        if faction_id is not None
        else await repos.events.list_all(room_id)
    )
    recent_events = visible_events[-100:]
    recent_messages = await _recent_messages(repos, room_id, current_turn)
    ai_thinking_state = _latest_ai_thinking_state(visible_events)
    border_tension = compute_border_tension(regions, relationships)
    winner, final_narration = await _final_outcome(repos, room_id, room)
    full_state = {
        "room": _room_state(room),
        "current_turn": current_turn.model_dump(mode="json") if current_turn is not None else None,
        "factions": [faction.model_dump(mode="json") for faction in factions],
        "regions": _regions_with_neighbors(regions),
        "relationships": [rel.model_dump(mode="json") for rel in relationships],
        "treaties": [treaty.model_dump(mode="json") for treaty in treaties],
        "recent_events": [event.model_dump(mode="json") for event in recent_events],
        "recent_messages": recent_messages,
        "ai_thinking_state": ai_thinking_state,
        "border_tension": border_tension,
        "winner": winner,
        "final_narration": final_narration,
    }
    if room is not None and getattr(room, "world_geometry", None) is not None:
        full_state["world_geometry"] = _world_geometry_payload(room.world_geometry)
    return full_state


def _room_state(room: Any) -> dict[str, Any]:
    if room is None:
        room_settings = get_settings().room_settings
        return {
            "id": "",
            "status": "unknown",
            "mode": "solo_1v7",
            "max_players": 0,
            "players": [],
            "ai_factions": [],
            "settings": room_settings.model_dump(mode="json"),
        }

    room_settings = build_room_snapshot(room).settings
    return {
        "id": room.id,
        "status": room.status.value if hasattr(room.status, "value") else str(room.status),
        "mode": room.mode,
        "max_players": room.max_players,
        "players": [player.model_dump(mode="json") for player in room.players],
        "ai_factions": list(room.ai_factions),
        "settings": room_settings.model_dump(mode="json"),
    }


def _world_geometry_payload(world_geometry: WorldGeometry | None) -> dict[str, Any] | None:
    if world_geometry is None:
        return None
    return build_world_geometry_payload(world_geometry).model_dump(mode="json")


async def _factions_meta_payload(repos: Repositories, room_id: str) -> dict[str, Any]:
    factions = await FactionsMetaService(repos).get_factions_meta(room_id)
    return {
        "room_id": room_id,
        "schema_version": "1.0",
        "factions": [faction.model_dump(mode="json") for faction in factions],
    }


def _room_snapshot(room: Any, current_player_id: str) -> dict[str, Any]:
    return {
        "room": _room_state(room),
        "current_player_id": current_player_id,
    }


def _regions_with_neighbors(regions: list[Any]) -> list[dict[str, Any]]:
    neighbor_map = build_region_neighbors(regions)
    return [
        {
            **region.model_dump(mode="json"),
            "neighbors": list(
                getattr(region, "neighbors", None) or neighbor_map.get(region.id, [])
            ),
        }
        for region in regions
    ]


async def _recent_messages(
    repos: Repositories,
    room_id: str,
    current_turn: Any | None,
) -> list[dict[str, Any]]:
    if current_turn is None:
        return []

    messages = await repos.messages.list_by_turn(room_id, current_turn.epoch, current_turn.turn)
    return [
        {
            **message.model_dump(mode="json"),
            "kind": "public" if message.visibility.scope == "public" else "private",
        }
        for message in messages[-50:]
    ]


def _latest_ai_thinking_state(events: list[GameEvent]) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.kind != "ai_thinking":
            continue
        payload = event.payload if isinstance(event.payload, dict) else {}
        return {
            "progress": float(payload.get("progress", 0.0)),
            "phase": str(payload.get("phase", "unknown")),
            "model": payload.get("model"),
            "elapsed_ms": int(payload.get("elapsed_ms", 0)),
        }
    return None


async def _final_outcome(
    repos: Repositories,
    room_id: str,
    room: Any | None,
) -> tuple[FactionId | None, str | None]:
    settlements = await repos.settlements.list_by_room(room_id)
    settlements.sort(key=lambda item: (item.epoch, item.turn, item.generated_at_ms))
    if settlements:
        latest = settlements[-1]
        winner = _settlement_winner(latest)
        final_narration = _settlement_final_narration(latest)
        if winner is not None or final_narration is not None:
            return winner, final_narration

    room_status = getattr(room, "status", None)
    if room is not None and room_status is not None and (
        getattr(room_status, "value", str(room_status)) == "finished"
    ):
        replay = await repos.replays.get_replay(room_id)
        if isinstance(replay, dict):
            winner = replay.get("winner")
            final_narration = replay.get("final_narration")
            return (
                winner if isinstance(winner, str) else None,
                final_narration if isinstance(final_narration, str) else None,
            )

    return None, None


def _settlement_winner(settlement: Any) -> FactionId | None:
    metadata = getattr(settlement, "metadata", None)
    if isinstance(metadata, dict):
        winner = metadata.get("winner")
        if isinstance(winner, str):
            return winner  # type: ignore[return-value]
    return None


def _settlement_final_narration(settlement: Any) -> str | None:
    metadata = getattr(settlement, "metadata", None)
    if isinstance(metadata, dict):
        final_narration = metadata.get("final_narration")
        if isinstance(final_narration, str):
            return final_narration
    return None
