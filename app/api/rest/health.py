from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.rest.deps import get_repositories
from app.core.config import get_settings
from app.llm.client import LLMRequest
from app.llm.mock_client import MockLLMClient
from app.repositories.factory import Repositories

router = APIRouter(tags=["health"])
_SERVICE_NAME = "diplomacy-backend"
_VERSION = "0.1.0"
_REPOSITORY_FIELDS = (
    "rooms",
    "players",
    "state",
    "actions",
    "messages",
    "events",
    "settlements",
    "replays",
)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": _SERVICE_NAME,
        "env": settings.env,
        "ws_path": settings.ws_path,
        "llm_provider": settings.llm_provider,
        "version": _VERSION,
    }


@router.get("/readyz")
async def readyz(
    repos: Annotated[Repositories, Depends(get_repositories)],
) -> dict[str, Any]:
    settings = get_settings()
    repositories_ok = _repositories_available(repos)
    db_ok = None if not settings.enable_persistence else False
    llm_ok = await _mock_llm_ready(settings.llm_provider)
    ready = repositories_ok and llm_ok and (db_ok is not False)

    return {
        "ready": ready,
        "status": "ok" if ready else "not_ready",
        "service": _SERVICE_NAME,
        "env": settings.env,
        "ws_path": settings.ws_path,
        "llm_provider": settings.llm_provider,
        "version": _VERSION,
        "checks": {
            "repositories": repositories_ok,
            "db": "skipped" if db_ok is None else db_ok,
            "mock_llm": llm_ok,
        },
    }


def _repositories_available(repos: Repositories) -> bool:
    return all(getattr(repos, field, None) is not None for field in _REPOSITORY_FIELDS)


async def _mock_llm_ready(llm_provider: str) -> bool:
    if llm_provider != "mock":
        return False

    response = await MockLLMClient().call_settlement_model(
        LLMRequest(
            system="healthcheck",
            user="dry-run",
            temperature=0.0,
            max_tokens=16,
            metadata={"purpose": "readyz"},
        )
    )
    return response.model == "mock" and bool(response.content)
