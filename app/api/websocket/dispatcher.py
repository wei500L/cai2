from __future__ import annotations

import json
from collections.abc import Callable
from time import time_ns
from typing import Any
from uuid import uuid4

from app.api.websocket.connection import ConnectionManager, PlayerSession
from app.core.clock import Clock, SystemClock
from app.domain.enums import FactionId, TerrainKind, VisibilityScope
from app.domain.factions import all_faction_ids
from app.domain.models import GameRoom, Player
from app.domain.world_geometry import WorldGeometry
from app.protocol.outgoing import (
    AIThinkingPayload,
    ReplayAIDiaryRevealPayload,
    RoomFinishedPayload,
    RoomPlayerResumePayload,
    RoomPlayerSnapshot,
    RoomPlayerTakeoverPayload,
    RoomSnapshotPayload,
    RoomStartPayload,
    WorldGeometryCellPayload,
    WorldGeometryFactionPayload,
    WorldGeometryPayload,
)
from app.repositories.factory import Repositories
from app.services.settlement_service import SettlementOutboundBundle

VisibilityFilter = Callable[[dict[str, Any], PlayerSession], bool]


class OutboundDispatcher:
    def __init__(
        self,
        connection_manager: ConnectionManager,
        repos: Repositories,
        clock: Clock | None = None,
    ) -> None:
        self._connection_manager = connection_manager
        self._repos = repos
        self._clock = clock or SystemClock()
        self._diary_revealed_rooms: set[str] = set()

    async def dispatch_to_player(self, player_id: str, envelope_dict: dict[str, Any]) -> None:
        session = await self._connection_manager.get_session(player_id)
        if session is None or not session.connected or session.websocket is None:
            return
        await session.websocket.send_text(_encode(_sanitize_for_delivery(envelope_dict)))

    async def dispatch_to_room(
        self,
        room_id: str,
        envelope_dict: dict[str, Any],
        *,
        visibility_filter: VisibilityFilter | None = None,
    ) -> None:
        for session in await self._connection_manager.get_room_subscribers(room_id):
            allowed = (
                visibility_filter(envelope_dict, session)
                if visibility_filter is not None
                else await self._default_visible(envelope_dict, session)
            )
            if not allowed:
                continue
            await self.dispatch_to_player(session.player_id, envelope_dict)

    async def emit(
        self,
        room_id: str,
        message_type: str,
        payload: dict[str, Any],
        *,
        seq: int | None = None,
    ) -> None:
        await self.dispatch_to_room(room_id, _envelope(message_type, payload, seq=seq))

    async def dispatch_phase_change(
        self,
        room_id: str,
        phase_change_payload: dict[str, Any],
    ) -> None:
        phase_change_payload = dict(phase_change_payload)
        phase_change_payload.setdefault("server_time_ms", self._clock.now_ms())
        await self.dispatch_to_room(room_id, _envelope("phase.change", phase_change_payload))

    async def dispatch_ai_thinking(
        self,
        room_id: str,
        *,
        progress: float = 0.05,
    ) -> None:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            return
        for faction_id in room.ai_factions:
            payload = AIThinkingPayload(
                room_id=room_id,
                faction_id=faction_id,
                progress=progress,
            )
            await self.dispatch_to_room(
                room_id,
                _envelope("ai.thinking", payload.model_dump(mode="json")),
            )

    async def dispatch_room_snapshot(self, room_id: str) -> None:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            return
        payload = _room_snapshot_payload(room)
        await self.dispatch_to_room(
            room.id,
            _envelope("room.snapshot", payload.model_dump(mode="json")),
        )

    async def dispatch_player_takeover(
        self,
        *,
        room_id: str,
        player_id: str,
        faction_id: FactionId,
        reason: str,
    ) -> None:
        payload = RoomPlayerTakeoverPayload(
            room_id=room_id,
            player_id=player_id,
            faction_id=faction_id,
            reason=reason,  # type: ignore[arg-type]
        )
        await self.dispatch_to_room(
            room_id,
            _envelope("room.player_takeover", payload.model_dump(mode="json")),
        )

    async def dispatch_player_resume(
        self,
        *,
        room_id: str,
        player_id: str,
        faction_id: FactionId,
    ) -> None:
        payload = RoomPlayerResumePayload(
            room_id=room_id,
            player_id=player_id,
            faction_id=faction_id,
        )
        await self.dispatch_to_room(
            room_id,
            _envelope("room.player_resume", payload.model_dump(mode="json")),
        )

    async def dispatch_room_start(self, room_id: str) -> None:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            return
        full_state = {
            "factions": [
                faction.model_dump(mode="json")
                for faction in await self._repos.state.get_factions(room_id)
            ],
            "regions": [
                region.model_dump(mode="json")
                for region in await self._repos.state.get_regions(room_id)
            ],
            "relationships": [
                rel.model_dump(mode="json")
                for rel in await self._repos.state.get_relationships(room_id)
            ],
            "current_turn": None,
        }
        current = await self._repos.state.get_current_turn(room_id)
        if current is not None:
            full_state["current_turn"] = current.model_dump(mode="json")
        payload = RoomStartPayload(room_id=room_id, initial_state=full_state)
        await self.dispatch_to_room(
            room_id,
            _envelope("room.start", payload.model_dump(mode="json")),
        )
        if room.world_geometry is not None:
            await self._dispatch_world_geometry(room_id, room.world_geometry)

    async def dispatch_room_finished(
        self,
        room_id: str,
        *,
        winner: FactionId | None,
        final_narration: str,
        replay_available: bool = True,
    ) -> None:
        payload = RoomFinishedPayload(
            room_id=room_id,
            winner=winner,
            final_narration=final_narration,
            replay_available=replay_available,
        )
        await self.dispatch_to_room(
            room_id,
            _envelope("room.finished", payload.model_dump(mode="json")),
        )

    async def dispatch_reconnect_snapshot(
        self,
        player_id: str,
        payload: dict[str, Any],
    ) -> None:
        await self._dispatch_world_geometry_if_present(player_id, payload)
        await self.dispatch_to_player(
            player_id,
            _envelope("reconnect.snapshot", payload, seq=payload.get("seq")),
        )

    async def dispatch_reconnect_catchup(
        self,
        player_id: str,
        payload: dict[str, Any],
    ) -> None:
        await self._dispatch_world_geometry_if_present(player_id, payload)
        await self.dispatch_to_player(
            player_id,
            _envelope("reconnect.catchup", payload, seq=payload.get("to_seq")),
        )

    async def dispatch_diary_reveal(self, room_id: str) -> None:
        room = await self._repos.rooms.get(room_id)
        if room is None or room.status.value != "finished":
            return

        if room_id in self._diary_revealed_rooms:
            return

        diaries_by_faction = await self._repos.diaries.list_all_by_room(room_id)
        for faction_id in all_faction_ids():
            entries = [
                entry.model_dump(mode="json")
                for entry in diaries_by_faction.get(faction_id, [])
            ]
            payload = ReplayAIDiaryRevealPayload(
                room_id=room_id,
                faction_id=faction_id,
                entries=entries,
            )
            await self.dispatch_to_room(
                room_id,
                _envelope("replay.ai_diary_reveal", payload.model_dump(mode="json")),
            )

        self._diary_revealed_rooms.add(room_id)

    async def dispatch_resolve_bundle(
        self,
        room_id: str,
        bundle: SettlementOutboundBundle,
    ) -> None:
        subscribers = await self._connection_manager.get_room_subscribers(room_id)
        recipient_rows: list[tuple[PlayerSession, FactionId | None, list[dict[str, Any]]]] = []

        for session in subscribers:
            faction_id = await self._session_faction(session)
            visible_events = [
                event
                for event in bundle.resolve_events
                if _event_visible_to_faction(event, faction_id)
            ]
            recipient_rows.append((session, faction_id, visible_events))

        for session, _faction_id, visible_events in recipient_rows:
            if visible_events:
                await self.dispatch_to_player(
                    session.player_id,
                    _envelope(
                        "resolve.events",
                        {
                            "room_id": room_id,
                            "epoch": bundle.epoch,
                            "turn": bundle.turn,
                            "events": visible_events,
                        },
                        seq=bundle.seq_base,
                    ),
                )

        seq_offset = 1
        if bundle.resolve_diplomatic_arcs:
            await self.emit(
                room_id,
                "resolve.diplomatic_arcs",
                {
                    "room_id": room_id,
                    "epoch": bundle.epoch,
                    "turn": bundle.turn,
                    "arcs": [
                        arc.model_dump(mode="json") for arc in bundle.resolve_diplomatic_arcs
                    ],
                },
                seq=bundle.seq_base + seq_offset,
            )
            seq_offset += 1

        if bundle.resolve_explosions:
            for index, explosion in enumerate(bundle.resolve_explosions):
                await self.dispatch_to_room(
                    room_id,
                    _envelope(
                        "resolve.event.explosion",
                        _dump_any(explosion),
                        seq=bundle.seq_base + seq_offset + index,
                    ),
                )
            seq_offset += len(bundle.resolve_explosions)

        if bundle.resolve_scorched_diff:
            await self.emit(
                room_id,
                "resolve.scorched_diff",
                {
                    "room_id": room_id,
                    "epoch": bundle.epoch,
                    "turn": bundle.turn,
                    "changes": [_dump_any(change) for change in bundle.resolve_scorched_diff],
                },
                seq=bundle.seq_base + seq_offset,
            )
            seq_offset += 1

        if bundle.resolve_ripples:
            await self.emit(
                room_id,
                "resolve.ripple",
                {
                    "room_id": room_id,
                    "epoch": bundle.epoch,
                    "turn": bundle.turn,
                    "ripples": [
                        ripple.model_dump(mode="json") for ripple in bundle.resolve_ripples
                    ],
                },
                seq=bundle.seq_base + seq_offset,
            )
            seq_offset += 1

        for session, faction_id, _visible_events in recipient_rows:
            await self.dispatch_to_player(
                session.player_id,
                _envelope(
                    "resolve.map_diff",
                    {
                        "room_id": room_id,
                        "epoch": bundle.epoch,
                        "turn": bundle.turn,
                        "changes": bundle.resolve_map_diff.get("changes", []),
                        "border_updates": bundle.resolve_map_diff.get("border_updates", []),
                    },
                    seq=bundle.seq_base + seq_offset,
                ),
            )
            await self.dispatch_to_player(
                session.player_id,
                _envelope(
                    "resolve.stats_diff",
                    {
                        "room_id": room_id,
                        "epoch": bundle.epoch,
                        "turn": bundle.turn,
                        "faction_stats": bundle.resolve_stats_diff.get("faction_stats", []),
                        "relationship_changes": bundle.resolve_stats_diff.get(
                            "relationship_changes",
                            [],
                        ),
                    },
                    seq=bundle.seq_base + seq_offset + 1,
                ),
            )

            for offset, event in enumerate(bundle.ai_speech_events, start=seq_offset + 2):
                if _event_visible_to_faction(event, faction_id):
                    await self.dispatch_to_player(
                        session.player_id,
                        _envelope(
                            "ai.speak",
                            {"room_id": room_id, "event": event},
                            seq=bundle.seq_base + offset,
                        ),
                    )

            if bundle.resolve_world_lighting is not None:
                await self.dispatch_to_player(
                    session.player_id,
                    _envelope(
                        "resolve.world_lighting",
                        bundle.resolve_world_lighting,
                        seq=bundle.seq_base + seq_offset + 2 + len(bundle.ai_speech_events),
                    ),
                )

    async def _session_faction(self, session: PlayerSession) -> FactionId | None:
        player = await self._repos.players.get(session.player_id)
        return player.faction_id if player is not None else None

    async def _dispatch_world_geometry_if_present(
        self,
        player_id: str,
        payload: dict[str, Any],
    ) -> None:
        world_geometry = payload.pop("world_geometry", None)
        if not isinstance(world_geometry, dict):
            return
        if not str(payload.get("room_id", "")):
            return
        await self.dispatch_to_player(
            player_id,
            _envelope("room.world_geometry", world_geometry),
        )

    async def _dispatch_world_geometry(self, room_id: str, world_geometry: WorldGeometry) -> None:
        payload = build_world_geometry_payload(world_geometry)
        await self.dispatch_to_room(
            room_id,
            _envelope("room.world_geometry", payload.model_dump(mode="json")),
        )

    async def _default_visible(
        self,
        envelope_dict: dict[str, Any],
        session: PlayerSession,
    ) -> bool:
        events = _extract_event_dicts(envelope_dict)
        if not events:
            return True
        faction_id = await self._session_faction(session)
        return all(
            _event_visible_to_faction(event, faction_id, session.player_id)
            for event in events
        )


def build_world_geometry_payload(world_geometry: WorldGeometry) -> WorldGeometryPayload:
    return WorldGeometryPayload(
        seed=world_geometry.seed,
        hex_resolution=world_geometry.hex_resolution,
        total_cells=world_geometry.total_cells,
        factions=[
            _world_geometry_faction(world_geometry, faction_id, lat, lng)
            for faction_id, lat, lng in world_geometry.capitals
        ],
        cells=[
            WorldGeometryCellPayload(
                lat=cell.lat,
                lng=cell.lng,
                hex_id=cell.hex_id,
                faction_id=cell.faction_id,
                terrain=TerrainKind(cell.terrain.value),
                elevation=cell.elevation,
                neighbors=list(cell.neighbors),
            )
            for cell in world_geometry.cells
        ],
    )


def _world_geometry_faction(
    world_geometry: WorldGeometry,
    faction_id: FactionId,
    capital_lat: float,
    capital_lng: float,
) -> WorldGeometryFactionPayload:
    return WorldGeometryFactionPayload(
        id=faction_id,
        capital_hex_id=_capital_hex_id(world_geometry, faction_id, capital_lat, capital_lng),
        capital_lat=capital_lat,
        capital_lng=capital_lng,
    )


def _capital_hex_id(
    world_geometry: WorldGeometry,
    faction_id: FactionId,
    capital_lat: float,
    capital_lng: float,
) -> str:
    candidate_hex_id = ""
    best_distance = float("inf")
    for cell in world_geometry.cells:
        if cell.faction_id != faction_id:
            continue
        distance = abs(cell.lat - capital_lat) + abs(cell.lng - capital_lng)
        if distance < best_distance:
            best_distance = distance
            candidate_hex_id = cell.hex_id

    if candidate_hex_id:
        return candidate_hex_id

    for cell in world_geometry.cells:
        distance = abs(cell.lat - capital_lat) + abs(cell.lng - capital_lng)
        if distance < best_distance:
            best_distance = distance
            candidate_hex_id = cell.hex_id

    return candidate_hex_id


def _encode(envelope_dict: dict[str, Any]) -> str:
    return json.dumps(envelope_dict, ensure_ascii=False, separators=(",", ":"))


def _envelope(message_type: str, payload: dict[str, Any], seq: int | None = None) -> dict[str, Any]:
    return {
        "v": 1,
        "id": f"msg_{uuid4().hex[:12]}",
        "t": message_type,
        "ts": time_ns() // 1_000_000,
        "seq": seq,
        "p": payload,
    }


def _event_visible_to_faction(
    event: dict[str, Any],
    faction_id: FactionId | None,
    player_id: str | None = None,
) -> bool:
    visibility = event.get("visibility")
    if not isinstance(visibility, dict):
        return True

    scope = visibility.get("scope")
    if scope == VisibilityScope.public:
        return True
    if faction_id is None:
        return False
    if scope == VisibilityScope.self:
        actor_player_id = _payload_value(event, "actor_player_id")
        if actor_player_id is not None:
            return player_id == str(actor_player_id)
        return str(faction_id) in _event_factions(event, "set")
    if scope == VisibilityScope.faction_pair:
        return str(faction_id) in _event_factions(event, "pair")
    if scope == VisibilityScope.faction_set:
        return str(faction_id) in _event_factions(event, "set")
    return False


def _dump_any(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _event_factions(event: dict[str, Any], payload_key: str) -> set[str]:
    payload = event.get("payload")
    visibility = event.get("visibility")
    if isinstance(payload, dict) and payload_key in payload:
        return {str(item) for item in payload[payload_key]}
    if isinstance(visibility, dict):
        return {str(item) for item in visibility.get("faction_ids", [])}
    return set()


def _payload_value(event: dict[str, Any], key: str) -> object | None:
    payload = event.get("payload")
    if isinstance(payload, dict) and key in payload:
        return payload[key]
    return event.get(key)


def _extract_event_dicts(envelope_dict: dict[str, Any]) -> list[dict[str, Any]]:
    payload = envelope_dict.get("p")
    if not isinstance(payload, dict):
        return []
    event = payload.get("event")
    if isinstance(event, dict):
        return [event]
    events = payload.get("events")
    if isinstance(events, list) and all(isinstance(item, dict) for item in events):
        return events
    if isinstance(payload.get("visibility"), dict):
        return [payload]
    return []


def _sanitize_for_delivery(envelope_dict: dict[str, Any]) -> dict[str, Any]:
    message_type = envelope_dict.get("t")
    if message_type not in {"action.broadcast", "action.private", "ai.speak", "ai.reaction"}:
        return envelope_dict

    payload = envelope_dict.get("p")
    if not isinstance(payload, dict):
        return envelope_dict

    event = payload.get("event")
    if not isinstance(event, dict):
        return envelope_dict

    sanitized_event = _strip_internal_for_runtime(event)
    if sanitized_event is event:
        return envelope_dict

    sanitized = dict(envelope_dict)
    sanitized_payload = dict(payload)
    sanitized_payload["event"] = sanitized_event
    sanitized["p"] = sanitized_payload
    return sanitized


def _strip_internal_for_runtime(event_payload: dict[str, Any]) -> dict[str, Any]:
    payload = event_payload.get("payload")
    if not isinstance(payload, dict) or "internal_thought" not in payload:
        return event_payload

    sanitized = dict(event_payload)
    sanitized_payload = dict(payload)
    sanitized_payload.pop("internal_thought", None)
    sanitized["payload"] = sanitized_payload
    return sanitized


def _room_snapshot_payload(room: GameRoom) -> RoomSnapshotPayload:
    return RoomSnapshotPayload(
        room_id=room.id,
        mode=room.mode,
        status=room.status.value,
        players=[_player_snapshot(player) for player in room.players],
        ai_factions=room.ai_factions,
    )


def _player_snapshot(player: Player) -> RoomPlayerSnapshot:
    return RoomPlayerSnapshot(
        player_id=player.id,
        display_name=player.display_name,
        faction_id=player.faction_id,
        connected=player.connected,
        ready=player.ready,
        ai_takeover=player.ai_takeover,
    )
