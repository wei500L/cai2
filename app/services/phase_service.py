from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import uuid4

from app.core.clock import Clock
from app.core.errors import (
    InvalidActionError,
    InvalidPhaseError,
    PlayerNotFoundError,
    RoomNotFoundError,
)
from app.domain.enums import (
    ArbitratePhase,
    EventKind,
    EventPriority,
    GamePhase,
    PlayerKind,
    RoomStatus,
    VisibilityScope,
)
from app.domain.models import EpochTurn, GameEvent, LockAction, MessageVisibility
from app.repositories.factory import Repositories

OBSERVE_DURATION_MS = 15_000
ACTION_DURATION_MS = 90_000
RESOLVE_DURATION_MS = 30_000
ARBITRATE_BATTLE_DURATION_MS = 20_000
ARBITRATE_EPIC_DURATION_MS = 60_000
ARBITRATE_SUMMARY_DURATION_MS = 15_000
MAX_EPOCH = 8
TURNS_PER_EPOCH = 3

PhaseKey = tuple[GamePhase, ArbitratePhase | None]
Transition = tuple[GamePhase, ArbitratePhase | None, int]

PHASE_TRANSITIONS: dict[PhaseKey, Transition] = {
    (GamePhase.observe, None): (GamePhase.action, None, ACTION_DURATION_MS),
    (GamePhase.action, None): (GamePhase.resolve, None, RESOLVE_DURATION_MS),
    (GamePhase.resolve, None): (GamePhase.observe, None, OBSERVE_DURATION_MS),
    (GamePhase.resolve, ArbitratePhase.battle): (
        GamePhase.arbitrate,
        ArbitratePhase.battle,
        ARBITRATE_BATTLE_DURATION_MS,
    ),
    (GamePhase.arbitrate, ArbitratePhase.battle): (
        GamePhase.arbitrate,
        ArbitratePhase.epic,
        ARBITRATE_EPIC_DURATION_MS,
    ),
    (GamePhase.arbitrate, ArbitratePhase.epic): (
        GamePhase.arbitrate,
        ArbitratePhase.summary,
        ARBITRATE_SUMMARY_DURATION_MS,
    ),
    (GamePhase.arbitrate, ArbitratePhase.summary): (
        GamePhase.observe,
        None,
        OBSERVE_DURATION_MS,
    ),
}
_PHASE_DURATIONS: dict[PhaseKey, int] = {
    (GamePhase.observe, None): OBSERVE_DURATION_MS,
    (GamePhase.action, None): ACTION_DURATION_MS,
    (GamePhase.resolve, None): RESOLVE_DURATION_MS,
    (GamePhase.arbitrate, ArbitratePhase.battle): ARBITRATE_BATTLE_DURATION_MS,
    (GamePhase.arbitrate, ArbitratePhase.epic): ARBITRATE_EPIC_DURATION_MS,
    (GamePhase.arbitrate, ArbitratePhase.summary): ARBITRATE_SUMMARY_DURATION_MS,
}


class PhaseService:
    def __init__(
        self,
        repos: Repositories,
        clock: Clock,
        *,
        on_settlement_required: Callable[[str, int, int], Awaitable[None]] | None = None,
        on_room_finished: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._on_settlement_required = on_settlement_required
        self._on_room_finished = on_room_finished

    async def begin_turn(self, room_id: str, epoch: int, turn: int) -> EpochTurn:
        room = await self._get_room_or_raise(room_id)
        current = EpochTurn(
            epoch=epoch,
            turn=turn,
            phase=GamePhase.observe,
            arbitrate_phase=None,
            phase_started_at_ms=self._clock.now_ms(),
            phase_duration_ms=OBSERVE_DURATION_MS,
        )

        room.current = current
        if room.status != RoomStatus.finished:
            room.status = RoomStatus.running
        await self._save_current_turn(room_id, current)
        await self._repos.rooms.update(room)
        await self._append_phase_change_event(room_id, current, include_turn_begin=True)
        return current

    async def lock_action(self, room_id: str, player_id: str) -> bool:
        room = await self._get_room_or_raise(room_id)
        current = await self._get_current_turn_or_raise(room_id)
        if current.phase != GamePhase.action:
            raise InvalidPhaseError(f"room {room_id} is not in action phase")

        player = next((candidate for candidate in room.players if candidate.id == player_id), None)
        if player is None:
            raise PlayerNotFoundError(f"player {player_id} not found in room {room_id}")
        if player.kind != PlayerKind.human:
            raise InvalidActionError("only human players can lock action phase")
        if player.faction_id is None:
            raise InvalidActionError("player must select a faction before locking")

        existing_lock_count = await self._repos.actions.count_by_player_turn(
            room_id,
            player_id,
            current.epoch,
            current.turn,
            "lock",
        )
        if existing_lock_count == 0:
            await self._repos.actions.append(
                LockAction(
                    id=f"act_{uuid4().hex[:12]}",
                    room_id=room_id,
                    epoch=current.epoch,
                    turn=current.turn,
                    phase=current.phase,
                    actor_player_id=player.id,
                    actor_faction=player.faction_id,
                    created_at_ms=self._clock.now_ms(),
                    visibility=MessageVisibility(
                        scope=VisibilityScope.self,
                        faction_ids=[player.faction_id],
                    ),
                    mode="lock",
                )
            )

        return await self._all_humans_locked(room, current)

    async def advance_phase(self, room_id: str) -> EpochTurn:
        room = await self._get_room_or_raise(room_id)
        current = await self._get_current_turn_or_raise(room_id)

        if self._is_final_summary(current):
            room.status = RoomStatus.finished
            room.current = current
            await self._repos.rooms.update(room)
            await self._append_phase_change_event(room_id, current, new_phase="finished")
            if self._on_room_finished is not None:
                await self._on_room_finished(room_id)
            return current

        next_phase, next_arbitrate_phase, duration_ms = self._next_transition(current)
        next_epoch, next_turn = self._next_epoch_turn(current, next_phase)
        next_current = EpochTurn(
            epoch=next_epoch,
            turn=next_turn,
            phase=next_phase,
            arbitrate_phase=next_arbitrate_phase,
            phase_started_at_ms=self._clock.now_ms(),
            phase_duration_ms=duration_ms,
        )

        room.current = next_current
        await self._save_current_turn(room_id, next_current)
        await self._repos.rooms.update(room)
        await self._append_phase_change_event(
            room_id,
            next_current,
            include_turn_begin=next_current.phase == GamePhase.observe,
        )

        if next_current.phase == GamePhase.resolve and self._on_settlement_required is not None:
            await self._on_settlement_required(room_id, next_current.epoch, next_current.turn)

        return next_current

    async def maybe_advance_by_clock(self, room_id: str) -> EpochTurn:
        current = await self._get_current_turn_or_raise(room_id)
        elapsed_ms = self._clock.now_ms() - current.phase_started_at_ms
        if elapsed_ms >= current.phase_duration_ms:
            return await self.advance_phase(room_id)
        return current

    async def maybe_advance_by_lock(self, room_id: str) -> EpochTurn:
        room = await self._get_room_or_raise(room_id)
        current = await self._get_current_turn_or_raise(room_id)
        if current.phase == GamePhase.action and await self._all_humans_locked(room, current):
            return await self.advance_phase(room_id)
        return current

    async def force_phase(
        self,
        room_id: str,
        *,
        phase: GamePhase,
        arbitrate_phase: ArbitratePhase | None = None,
    ) -> EpochTurn:
        room = await self._get_room_or_raise(room_id)
        current = await self._get_current_turn_or_raise(room_id)
        forced = EpochTurn(
            epoch=current.epoch,
            turn=current.turn,
            phase=phase,
            arbitrate_phase=arbitrate_phase,
            phase_started_at_ms=self._clock.now_ms(),
            phase_duration_ms=_PHASE_DURATIONS.get((phase, arbitrate_phase), 0),
        )
        room.current = forced
        await self._save_current_turn(room_id, forced)
        await self._repos.rooms.update(room)
        await self._append_phase_change_event(room_id, forced, debug_forced=True)
        return forced

    def _next_transition(self, current: EpochTurn) -> Transition:
        key = self._transition_key(current)
        transition = PHASE_TRANSITIONS.get(key)
        if transition is None:
            raise InvalidPhaseError(f"invalid phase transition from {key}")
        return transition

    @staticmethod
    def _transition_key(current: EpochTurn) -> PhaseKey:
        if current.phase == GamePhase.resolve and current.turn % TURNS_PER_EPOCH == 0:
            return (GamePhase.resolve, ArbitratePhase.battle)
        return (current.phase, current.arbitrate_phase)

    def _next_epoch_turn(self, current: EpochTurn, next_phase: GamePhase) -> tuple[int, int]:
        if current.phase == GamePhase.resolve and next_phase == GamePhase.observe:
            return current.epoch, current.turn + 1
        if (
            current.phase == GamePhase.arbitrate
            and current.arbitrate_phase == ArbitratePhase.summary
        ):
            return current.epoch + 1, 1
        return current.epoch, current.turn

    async def _all_humans_locked(self, room: object, current: EpochTurn) -> bool:
        human_players = [
            player
            for player in getattr(room, "players", [])
            if player.kind == PlayerKind.human
        ]
        for player in human_players:
            if getattr(player, "ai_takeover", False):
                continue
            lock_count = await self._repos.actions.count_by_player_turn(
                room.id,
                player.id,
                current.epoch,
                current.turn,
                "lock",
            )
            if lock_count == 0:
                return False
        return True

    async def _get_room_or_raise(self, room_id: str):
        room = await self._repos.rooms.get(room_id)
        if room is None:
            raise RoomNotFoundError(f"room {room_id} not found")
        return room

    async def _get_current_turn_or_raise(self, room_id: str) -> EpochTurn:
        current = await self._repos.state.get_current_turn(room_id)
        if current is not None:
            return current

        room = await self._get_room_or_raise(room_id)
        if room.current is None:
            raise InvalidPhaseError(f"room {room_id} has no current turn")
        return room.current

    async def _save_current_turn(self, room_id: str, current: EpochTurn) -> None:
        await self._repos.state.save_current_turn(room_id, current)

    async def _append_phase_change_event(
        self,
        room_id: str,
        current: EpochTurn,
        *,
        include_turn_begin: bool = False,
        new_phase: str | None = None,
        debug_forced: bool = False,
    ) -> None:
        server_time_ms = self._clock.now_ms()
        payload: dict[str, object] = {
            "new_phase": new_phase or current.phase.value,
            "arbitrate_phase": (
                current.arbitrate_phase.value if current.arbitrate_phase is not None else None
            ),
            "epoch": current.epoch,
            "turn": current.turn,
            "phase_duration_ms": current.phase_duration_ms,
            "phase_started_at_ms": current.phase_started_at_ms,
            "server_time_ms": server_time_ms,
        }
        if include_turn_begin:
            payload["turn_begin"] = {
                "room_id": room_id,
                "epoch": current.epoch,
                "turn": current.turn,
                "phase": current.phase.value,
                "arbitrate_phase": (
                    current.arbitrate_phase.value if current.arbitrate_phase is not None else None
                ),
                "phase_duration_ms": current.phase_duration_ms,
                "phase_started_at_ms": current.phase_started_at_ms,
                "server_time_ms": server_time_ms,
            }
        if debug_forced:
            payload["debug_forced"] = True

        await self._repos.events.append(
            GameEvent(
                id=f"event_phase_{uuid4().hex[:12]}",
                room_id=room_id,
                epoch=current.epoch,
                turn=current.turn,
                phase=current.phase,
                created_at_ms=self._clock.now_ms(),
                priority=EventPriority.P1,
                kind=EventKind.phase_change,
                actor_faction=None,
                target_faction=None,
                payload=payload,
                narration=f"Phase changed to {payload['new_phase']}",
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            )
        )

    @staticmethod
    def _is_final_summary(current: EpochTurn) -> bool:
        return (
            current.phase == GamePhase.arbitrate
            and current.arbitrate_phase == ArbitratePhase.summary
            and current.epoch >= MAX_EPOCH
        )
