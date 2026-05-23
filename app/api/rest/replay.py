from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.rest.deps import get_replay_service
from app.core.errors import RoomNotFoundError
from app.services.replay_service import ReplayDTO, ReplayService

router = APIRouter(tags=["debug"])


@router.get("/rooms/{room_id}/replay", response_model=ReplayDTO)
async def get_replay(
    room_id: str,
    replay_service: Annotated[ReplayService, Depends(get_replay_service)],
) -> ReplayDTO | JSONResponse:
    try:
        return await replay_service.build_replay(room_id)
    except RoomNotFoundError:
        return JSONResponse(status_code=404, content={"error": "room_not_found"})
