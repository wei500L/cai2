from __future__ import annotations

import json
from collections.abc import Callable
from time import time_ns
from typing import Any
from uuid import uuid4

from app.api.websocket.connection import ConnectionManager, PlayerSession
from app.domain.enums import FactionId, VisibilityScope
from app.repositories.factory import Repositories
from app.services.settlement_service import SettlementOutboundBundle

VisibilityFilter = Callable[[PlayerSession], bool]


class OutboundDispatcher:
    def __init__(self, connection_manager: ConnectionManager, repos: Repositories) -> None:
        self._connection_manager = connection_manager
        self._repos = repos

    async def dispatch_to_player(self, player_id: str, envelope_dict: dict[str, Any]) -> None:
        session = await self._connection_manager.get_session(player_id)
        if session is None or not session.connected or session.websocket is None:
            return
        await session.websocket.send_text(_encode(envelope_dict))

    async def dispatch_to_room(
        self,
        room_id: str,
        envelope_dict: dict[str, Any],
        *,
        visibility_filter: VisibilityFilter | None = None,
    ) -> None:
        for session in await self._connection_manager.get_room_subscribers(room_id):
            if visibility_filter is not None and not visibility_filter(session):
                continue
            await self.dispatch_to_player(session.player_id, envelope_dict)

    async def dispatch_phase_change(
        self,
        room_id: str,
        phase_change_payload: dict[str, Any],
    ) -> None:
        await self.dispatch_to_room(room_id, _envelope("phase.change", phase_change_payload))

    async def dispatch_resolve_bundle(
        self,
        room_id: str,
        bundle: SettlementOutboundBundle,
    ) -> None:
        subscribers = await self._connection_manager.get_room_subscribers(room_id)

        for session in subscribers:
            faction_id = await self._session_faction(session)
            visible_events = [
                event
                for event in bundle.resolve_events
                if _event_visible_to_faction(event, faction_id)
            ]
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
                    seq=bundle.seq_base + 1,
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
                    seq=bundle.seq_base + 2,
                ),
            )

            for offset, event in enumerate(bundle.ai_speech_events, start=3):
                if _event_visible_to_faction(event, faction_id):
                    await self.dispatch_to_player(
                        session.player_id,
                        _envelope(
                            "ai.speak",
                            {"room_id": room_id, "event": event},
                            seq=bundle.seq_base + offset,
                        ),
                    )

    async def _session_faction(self, session: PlayerSession) -> FactionId | None:
        player = await self._repos.players.get(session.player_id)
        return player.faction_id if player is not None else None


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


def _event_visible_to_faction(event: dict[str, Any], faction_id: FactionId | None) -> bool:
    visibility = event.get("visibility")
    if not isinstance(visibility, dict):
        return True

    scope = visibility.get("scope")
    if scope == VisibilityScope.public:
        return True
    if faction_id is None:
        return False
    if scope == VisibilityScope.self:
        return event.get("actor_faction") == faction_id
    if scope == VisibilityScope.faction_pair:
        return str(faction_id) in _event_factions(event, "pair")
    if scope == VisibilityScope.faction_set:
        return str(faction_id) in _event_factions(event, "set")
    return False


def _event_factions(event: dict[str, Any], payload_key: str) -> set[str]:
    payload = event.get("payload")
    visibility = event.get("visibility")
    if isinstance(payload, dict) and payload_key in payload:
        return {str(item) for item in payload[payload_key]}
    if isinstance(visibility, dict):
        return {str(item) for item in visibility.get("faction_ids", [])}
    return set()
