from __future__ import annotations

import asyncio
from typing import Literal

from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import Clock
from app.domain.models import GameRoom, Player
from app.repositories.factory import Repositories

TakeoverReason = Literal["disconnected_30s", "manual_leave"]


class TakeoverService:
    def __init__(
        self,
        repos: Repositories,
        clock: Clock,
        dispatcher: OutboundDispatcher,
        *,
        takeover_after_s: float = 30,
        permanent_after_s: float = 300,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._dispatcher = dispatcher
        self._takeover_after_s = takeover_after_s
        self._permanent_after_s = max(permanent_after_s, takeover_after_s)
        self._tasks: dict[tuple[str, str], asyncio.Task[None]] = {}

    async def on_disconnect(self, room_id: str, player_id: str) -> None:
        await self._mark_player(
            room_id,
            player_id,
            connected=False,
            ai_takeover=False,
            disconnected_at_ms=self._clock.now_ms(),
        )
        await self._dispatcher.dispatch_room_snapshot(room_id)
        key = (room_id, player_id)
        self._cancel_task(key)
        self._tasks[key] = asyncio.create_task(self._run_disconnect_timer(room_id, player_id))

    async def on_manual_leave(self, room_id: str, player_id: str) -> None:
        key = (room_id, player_id)
        self._cancel_task(key)
        player = await self._mark_player(
            room_id,
            player_id,
            connected=False,
            ai_takeover=True,
            disconnected_at_ms=self._clock.now_ms(),
        )
        if player is None or player.faction_id is None:
            return
        await self._dispatcher.dispatch_player_takeover(
            room_id=room_id,
            player_id=player_id,
            faction_id=player.faction_id,
            reason="manual_leave",
        )
        await self._dispatcher.dispatch_room_snapshot(room_id)

    async def on_reconnect(self, room_id: str, player_id: str) -> None:
        key = (room_id, player_id)
        self._cancel_task(key)
        before = await self._player_in_room(room_id, player_id)
        player = await self._mark_player(
            room_id,
            player_id,
            connected=True,
            ai_takeover=False,
            disconnected_at_ms=None,
        )
        if player is not None and player.faction_id is not None and before and before.ai_takeover:
            await self._dispatcher.dispatch_player_resume(
                room_id=room_id,
                player_id=player_id,
                faction_id=player.faction_id,
            )
        await self._dispatcher.dispatch_room_snapshot(room_id)

    async def _run_disconnect_timer(self, room_id: str, player_id: str) -> None:
        try:
            await asyncio.sleep(self._takeover_after_s)
            player = await self._player_in_room(room_id, player_id)
            if player is None or player.connected or player.faction_id is None:
                return
            await self._mark_player(
                room_id,
                player_id,
                connected=False,
                ai_takeover=True,
                disconnected_at_ms=player.disconnected_at_ms,
            )
            await self._dispatcher.dispatch_player_takeover(
                room_id=room_id,
                player_id=player_id,
                faction_id=player.faction_id,
                reason="disconnected_30s",
            )
            await self._dispatcher.dispatch_room_snapshot(room_id)

            await asyncio.sleep(self._permanent_after_s - self._takeover_after_s)
            player = await self._player_in_room(room_id, player_id)
            if player is not None and not player.connected:
                await self._mark_player(
                    room_id,
                    player_id,
                    connected=False,
                    ai_takeover=True,
                    disconnected_at_ms=player.disconnected_at_ms,
                )
        finally:
            self._tasks.pop((room_id, player_id), None)

    async def _mark_player(
        self,
        room_id: str,
        player_id: str,
        *,
        connected: bool,
        ai_takeover: bool,
        disconnected_at_ms: int | None,
    ) -> Player | None:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            return None
        player = _find_player(room, player_id)
        if player is None:
            stored = await self._repos.players.get(player_id)
            if stored is None or stored.room_id != room_id:
                return None
            player = stored
        player.connected = connected
        player.ai_takeover = ai_takeover
        player.disconnected_at_ms = disconnected_at_ms
        _replace_player(room, player)
        await self._repos.rooms.update(room)
        await self._repos.players.upsert(player)
        return player

    async def _player_in_room(self, room_id: str, player_id: str) -> Player | None:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            return None
        return _find_player(room, player_id)

    def _cancel_task(self, key: tuple[str, str]) -> None:
        task = self._tasks.pop(key, None)
        if task is not None:
            task.cancel()


def _find_player(room: GameRoom, player_id: str) -> Player | None:
    return next((player for player in room.players if player.id == player_id), None)


def _replace_player(room: GameRoom, player: Player) -> None:
    for index, candidate in enumerate(room.players):
        if candidate.id == player.id:
            room.players[index] = player
            return
    room.players.append(player)
