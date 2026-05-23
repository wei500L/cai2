from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.api.websocket.router import InboundRouter
from app.core.clock import SystemClock
from app.core.config import get_settings
from app.core.logging import get_logger
from app.repositories.factory import make_repositories
from app.services.action_service import ActionService
from app.services.phase_service import PhaseService
from app.services.room_service import RoomService

router = APIRouter()
logger = get_logger(__name__)


class GameWebSocketGateway:
    def __init__(
        self,
        *,
        connection_manager: ConnectionManager,
        inbound_router: InboundRouter,
        dispatcher: OutboundDispatcher,
    ) -> None:
        self._connection_manager = connection_manager
        self._inbound_router = inbound_router
        self._dispatcher = dispatcher

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
            await self._connection_manager.unregister(player_id)


def build_gateway() -> GameWebSocketGateway:
    repos = make_repositories("memory")
    clock = SystemClock()
    connection_manager = ConnectionManager()
    inbound_router = InboundRouter(
        room_service=RoomService(repos, clock),
        action_service=ActionService(repos, clock),
        phase_service=PhaseService(repos, clock),
        settlement_service=None,
        repos=repos,
        clock=clock,
    )
    dispatcher = OutboundDispatcher(connection_manager, repos)
    return GameWebSocketGateway(
        connection_manager=connection_manager,
        inbound_router=inbound_router,
        dispatcher=dispatcher,
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
