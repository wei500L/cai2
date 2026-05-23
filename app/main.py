from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.api.rest.debug import router as debug_router
from app.api.rest.health import router as health_router
from app.api.websocket import router as websocket_router
from app.core.config import get_settings
from app.core.errors import (
    DiplomacyError,
    FactionAlreadyTakenError,
    InvalidActionError,
    InvalidPhaseError,
    RateLimitedError,
    RoomNotFoundError,
)

settings = get_settings()
app = FastAPI(title="Diplomacy Backend", version="0.1.0")

if settings.env == "dev":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(health_router)
app.include_router(debug_router)
app.include_router(websocket_router)


@app.exception_handler(DiplomacyError)
async def diplomacy_error_handler(request: Request, exc: DiplomacyError) -> JSONResponse:
    del request
    return JSONResponse(
        status_code=_status_code_for_diplomacy_error(exc),
        content={"error_code": exc.__class__.__name__, "message": str(exc)},
    )


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    del request, exc
    return JSONResponse(
        status_code=500,
        content={"error_code": "internal", "message": "Internal Server Error"},
    )


def _status_code_for_diplomacy_error(exc: DiplomacyError) -> int:
    if isinstance(exc, RoomNotFoundError):
        return 404
    if isinstance(exc, FactionAlreadyTakenError):
        return 409
    if isinstance(exc, InvalidPhaseError | InvalidActionError | RateLimitedError):
        return 400
    return 400


if __name__ == "__main__":
    pass
