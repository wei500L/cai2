from __future__ import annotations

import asyncio
from time import time_ns
from typing import Any

from pydantic import BaseModel, ConfigDict


def _now_ms() -> int:
    return time_ns() // 1_000_000


class PlayerSession(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    player_id: str
    room_id: str | None = None
    last_seq: int = 0
    connected_at_ms: int
    disconnected_at_ms: int | None = None
    connected: bool = True
    websocket: Any


class ConnectionManager:
    def __init__(self, *, session_retention_ms: int = 300_000) -> None:
        self._sessions: dict[str, PlayerSession] = {}
        self._room_subscribers: dict[str, set[str]] = {}
        self._session_retention_ms = session_retention_ms
        self._lock = asyncio.Lock()

    async def register(self, player_id: str, websocket: Any) -> PlayerSession:
        async with self._lock:
            self._prune_expired_locked()
            previous = self._sessions.get(player_id)
            session = PlayerSession(
                player_id=player_id,
                room_id=previous.room_id if previous is not None else None,
                last_seq=previous.last_seq if previous is not None else 0,
                connected_at_ms=_now_ms(),
                disconnected_at_ms=None,
                connected=True,
                websocket=websocket,
            )
            self._sessions[player_id] = session
            if session.room_id is not None:
                self._room_subscribers.setdefault(session.room_id, set()).add(player_id)
            return session

    async def unregister(self, player_id: str) -> PlayerSession | None:
        async with self._lock:
            session = self._sessions.get(player_id)
            if session is None:
                return None
            session.connected = False
            session.websocket = None
            session.disconnected_at_ms = _now_ms()
            return session.model_copy(deep=True)

    async def attach_to_room(self, player_id: str, room_id: str) -> None:
        async with self._lock:
            self._prune_expired_locked()
            session = self._sessions.get(player_id)
            if session is None:
                return
            if session.room_id is not None and session.room_id != room_id:
                previous = self._room_subscribers.get(session.room_id)
                if previous is not None:
                    previous.discard(player_id)
                    if not previous:
                        self._room_subscribers.pop(session.room_id, None)
            session.room_id = room_id
            self._room_subscribers.setdefault(room_id, set()).add(player_id)

    async def detach_from_room(self, player_id: str) -> None:
        async with self._lock:
            session = self._sessions.get(player_id)
            if session is None or session.room_id is None:
                return
            room_id = session.room_id
            session.room_id = None
            subscribers = self._room_subscribers.get(room_id)
            if subscribers is not None:
                subscribers.discard(player_id)
                if not subscribers:
                    self._room_subscribers.pop(room_id, None)

    async def get_room_subscribers(self, room_id: str) -> list[PlayerSession]:
        async with self._lock:
            self._prune_expired_locked()
            player_ids = self._room_subscribers.get(room_id, set()).copy()
            return [
                session
                for player_id in sorted(player_ids)
                if (session := self._sessions.get(player_id)) is not None and session.connected
            ]

    async def get_session(self, player_id: str) -> PlayerSession | None:
        async with self._lock:
            self._prune_expired_locked()
            return self._sessions.get(player_id)

    def _prune_expired_locked(self) -> None:
        now_ms = _now_ms()
        expired = [
            player_id
            for player_id, session in self._sessions.items()
            if not session.connected
            and session.disconnected_at_ms is not None
            and now_ms - session.disconnected_at_ms >= self._session_retention_ms
        ]
        for player_id in expired:
            session = self._sessions.pop(player_id, None)
            if session is None or session.room_id is None:
                continue
            subscribers = self._room_subscribers.get(session.room_id)
            if subscribers is not None:
                subscribers.discard(player_id)
                if not subscribers:
                    self._room_subscribers.pop(session.room_id, None)
