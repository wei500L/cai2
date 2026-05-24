from __future__ import annotations

import asyncio
from typing import Any

from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import Clock
from app.core.logging import get_logger
from app.domain.enums import ArbitratePhase, GamePhase, RoomStatus
from app.domain.models import EpochTurn
from app.protocol.outgoing import PhaseChangePayload
from app.repositories.factory import Repositories

logger = get_logger(__name__)


class PhaseScheduler:
    def __init__(
        self,
        *,
        phase_service: Any,
        settlement_service: Any,
        opening_service: Any | None = None,
        repos: Repositories,
        clock: Clock,
        dispatcher: OutboundDispatcher,
        tick_interval_s: float = 1.0,
    ) -> None:
        self._phase_service = phase_service
        self._settlement_service = settlement_service
        self._opening_service = opening_service
        self._repos = repos
        self._clock = clock
        self._dispatcher = dispatcher
        self.tick_interval_s = tick_interval_s
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._settlement_tasks: set[asyncio.Task[None]] = set()
        self._settling_rooms: set[str] = set()

    async def start_room(self, room_id: str) -> None:
        task = self._tasks.get(room_id)
        if task is not None and not task.done():
            return

        self._tasks[room_id] = asyncio.create_task(
            self._room_loop(room_id),
            name=f"phase-scheduler:{room_id}",
        )
        logger.info("phase scheduler started room_id=%s", room_id)

        if self._opening_service is not None:
            opening_task = asyncio.create_task(
                self._run_opening_narration(room_id),
                name=f"opening-narration:{room_id}",
            )
            self._settlement_tasks.add(opening_task)
            opening_task.add_done_callback(self._settlement_tasks.discard)

    async def stop_room(self, room_id: str) -> None:
        task = self._tasks.pop(room_id, None)
        if task is None:
            return

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("phase scheduler stopped room_id=%s", room_id)

    async def start_running_rooms(self) -> None:
        for room in await self._repos.rooms.list_active():
            if room.status == RoomStatus.running:
                await self.start_room(room.id)

    async def shutdown(self) -> None:
        tasks = list(self._tasks.items())
        self._tasks.clear()
        for _, task in tasks:
            task.cancel()
        settlement_tasks = list(self._settlement_tasks)
        self._settlement_tasks.clear()
        for task in settlement_tasks:
            task.cancel()
        for room_id, task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info("phase scheduler shutdown room_id=%s", room_id)
        for task in settlement_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass

    def is_settling(self, room_id: str) -> bool:
        return room_id in self._settling_rooms

    async def _room_loop(self, room_id: str) -> None:
        try:
            while True:
                await asyncio.sleep(self.tick_interval_s)
                room = await self._repos.rooms.get(room_id)
                if room is None or room.status != RoomStatus.running:
                    logger.debug(
                        "phase scheduler exiting room_id=%s reason=not_running",
                        room_id,
                    )
                    break

                current = await self._repos.state.get_current_turn(room_id)
                if current is None:
                    logger.debug(
                        "phase scheduler exiting room_id=%s reason=no_current_turn",
                        room_id,
                    )
                    break

                if room_id in self._settling_rooms:
                    continue

                previous = _phase_key(current)
                new_turn = await self._phase_service.maybe_advance_by_clock(room_id)
                if _phase_key(new_turn) == previous:
                    continue

                logger.info(
                    "phase scheduler advanced room_id=%s epoch=%s turn=%s "
                    "phase=%s arbitrate_phase=%s",
                    room_id,
                    new_turn.epoch,
                    new_turn.turn,
                    new_turn.phase,
                    new_turn.arbitrate_phase,
                )

                turn_changed = (previous[0], previous[1]) != (new_turn.epoch, new_turn.turn)

                if turn_changed:
                    await self._dispatcher.emit(room_id, "turn.end", {
                        "room_id": room_id,
                        "epoch": previous[0],
                        "turn": previous[1],
                        "next_epoch": new_turn.epoch,
                        "next_turn": new_turn.turn,
                        "server_time_ms": self._clock.now_ms(),
                    })

                await self._dispatch_phase_change(room_id, new_turn)

                if turn_changed:
                    await self._dispatcher.emit(room_id, "turn.begin", {
                        "room_id": room_id,
                        "epoch": new_turn.epoch,
                        "turn": new_turn.turn,
                        "phase": new_turn.phase.value,
                        "arbitrate_phase": new_turn.arbitrate_phase.value if new_turn.arbitrate_phase else None,
                        "phase_duration_ms": new_turn.phase_duration_ms,
                        "phase_started_at_ms": new_turn.phase_started_at_ms,
                        "server_time_ms": self._clock.now_ms(),
                        "visible_snapshot": {},
                    })

                if new_turn.phase == GamePhase.resolve:
                    task = asyncio.create_task(
                        self._run_settlement(room_id, new_turn.epoch, new_turn.turn),
                        name=f"settlement:{room_id}:{new_turn.epoch}:{new_turn.turn}",
                    )
                    self._settlement_tasks.add(task)
                    task.add_done_callback(self._settlement_tasks.discard)
                elif (
                    new_turn.phase == GamePhase.arbitrate
                    and new_turn.arbitrate_phase == ArbitratePhase.battle
                ):
                    task = asyncio.create_task(
                        self._run_epoch_narration(room_id, new_turn.epoch),
                        name=f"epoch-narration:{room_id}:{new_turn.epoch}",
                    )
                    self._settlement_tasks.add(task)
                    task.add_done_callback(self._settlement_tasks.discard)
        except asyncio.CancelledError:
            pass
        finally:
            current_task = asyncio.current_task()
            if self._tasks.get(room_id) is current_task:
                self._tasks.pop(room_id, None)

    async def _dispatch_phase_change(self, room_id: str, current: EpochTurn) -> None:
        payload = PhaseChangePayload(
            room_id=room_id,
            epoch=current.epoch,
            turn=current.turn,
            phase=current.phase,
            arbitrate_phase=current.arbitrate_phase,
            phase_duration_ms=current.phase_duration_ms,
            phase_started_at_ms=current.phase_started_at_ms,
            server_time_ms=self._clock.now_ms(),
        )
        await self._dispatcher.dispatch_phase_change(room_id, payload.model_dump(mode="json"))

    async def _run_settlement(self, room_id: str, epoch: int, turn: int) -> None:
        self._settling_rooms.add(room_id)
        try:
            await self._dispatcher.dispatch_ai_thinking(room_id)
            bundle = await self._settlement_service.run_turn_settlement(room_id, epoch, turn)
            await self._dispatcher.dispatch_resolve_bundle(room_id, bundle)
        except Exception as error:
            logger.exception(
                "scheduled settlement failed room_id=%s epoch=%s turn=%s error=%s",
                room_id,
                epoch,
                turn,
                error,
            )
            await self._dispatcher.emit(room_id, "error.message", {
                "reason": f"Settlement failed: {error}",
                "error_code": "SETTLEMENT_FAILED",
                "request_id": None,
            })
        finally:
            self._settling_rooms.discard(room_id)

    async def _run_epoch_narration(self, room_id: str, epoch: int) -> None:
        self._settling_rooms.add(room_id)
        try:
            bundle = await self._settlement_service.run_epoch_settlement(room_id, epoch)
            await self._dispatcher.dispatch_epoch_narration_bundle(room_id, bundle)
        except Exception as error:
            logger.exception(
                "scheduled epoch narration failed room_id=%s epoch=%s error=%s",
                room_id,
                epoch,
                error,
            )
            await self._dispatcher.emit(room_id, "error.message", {
                "reason": f"Epoch narration failed: {error}",
                "error_code": "EPOCH_NARRATION_FAILED",
                "request_id": None,
            })
        finally:
            self._settling_rooms.discard(room_id)

    async def _run_opening_narration(self, room_id: str) -> None:
        try:
            room = await self._repos.rooms.get(room_id)
            if room is None:
                return
            factions = await self._repos.state.get_factions(room_id)
            relationships = await self._repos.state.get_relationships(room_id)
            if not factions or not relationships:
                logger.warning("opening narration skipped: missing state room_id=%s", room_id)
                return

            bundle = await self._opening_service.generate_opening_content(
                room_id=room_id,
                factions=factions,
                relationships=relationships,
                ai_faction_ids=list(room.ai_factions),
            )
            await self._dispatcher.dispatch_opening_content(room_id, bundle)
            logger.info("opening narration dispatched room_id=%s", room_id)
        except Exception as error:
            logger.exception(
                "opening narration failed room_id=%s error=%s",
                room_id,
                error,
            )


def _phase_key(current: EpochTurn) -> tuple[int, int, GamePhase, object | None]:
    return (current.epoch, current.turn, current.phase, current.arbitrate_phase)
