from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.rest.deps import (
    get_action_service,
    get_clock,
    get_connection_manager,
    get_outbound_dispatcher,
    get_phase_scheduler,
    get_phase_service,
    get_repositories,
    get_room_service,
    get_settlement_service,
    get_takeover_service,
)
from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.api.websocket.router import InboundRouter
from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.phase_scheduler import PhaseScheduler
from app.services.takeover_service import TakeoverService

router = APIRouter()
logger = get_logger(__name__)


class GameWebSocketGateway:
    def __init__(
        self,
        *,
        connection_manager: ConnectionManager,
        inbound_router: InboundRouter,
        dispatcher: OutboundDispatcher,
        takeover_service: TakeoverService,
        phase_scheduler: PhaseScheduler,
    ) -> None:
        self._connection_manager = connection_manager
        self._inbound_router = inbound_router
        self._dispatcher = dispatcher
        self._takeover_service = takeover_service
        self._phase_scheduler = phase_scheduler

    async def startup(self) -> None:
        await self._phase_scheduler.start_running_rooms()

    async def shutdown(self) -> None:
        await self._phase_scheduler.shutdown()

    async def handle(self, websocket: WebSocket) -> None:
        player_id = websocket.query_params.get("player_id") or f"conn_{uuid4().hex[:12]}"
        logger.info("websocket origin=%s player_id=%s", websocket.headers.get("origin"), player_id)
        await websocket.accept()
        await self._connection_manager.register(player_id, websocket)
        try:
            while True:
                raw_text = await websocket.receive_text()
                outbound = await self._inbound_router.handle_raw(player_id, _decode(raw_text))
                if outbound is not None:
                    await self._dispatcher.dispatch_to_player(player_id, outbound)
        except WebSocketDisconnect:
            pass
        finally:
            session = await self._connection_manager.unregister(player_id)
            if session is not None and session.room_id is not None:
                await self._takeover_service.on_disconnect(session.room_id, player_id)


def build_gateway() -> GameWebSocketGateway:
    repos = get_repositories()
    clock = get_clock()
    connection_manager = get_connection_manager()
    dispatcher = get_outbound_dispatcher()
    takeover_service = get_takeover_service()
    phase_scheduler = get_phase_scheduler()
    settlement_service = get_settlement_service(repos, clock)
    inbound_router = InboundRouter(
        room_service=get_room_service(repos, clock, phase_scheduler),
        action_service=get_action_service(repos, clock),
        phase_service=get_phase_service(repos, clock, dispatcher),
        settlement_service=settlement_service,
        repos=repos,
        clock=clock,
        connection_manager=connection_manager,
        dispatcher=dispatcher,
        takeover_service=takeover_service,
    )
    return GameWebSocketGateway(
        connection_manager=connection_manager,
        inbound_router=inbound_router,
        dispatcher=dispatcher,
        takeover_service=takeover_service,
        phase_scheduler=phase_scheduler,
    )


gateway = build_gateway()


@router.websocket(get_settings().ws_path)
async def endpoint(websocket: WebSocket) -> None:
    await gateway.handle(websocket)


def _decode(raw_text: str) -> dict[str, Any]:
    decoded = json.loads(raw_text)
    if not isinstance(decoded, dict):
        raise ValueError("websocket message must decode to an object")
    return decoded
