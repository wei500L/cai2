from time import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.api.rest.deps import get_repositories
from app.core.config import get_settings
from app.llm.factory import make_llm_client
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
async def healthz() -> dict[str, Any]:
    settings = get_settings()
    return {
        "ok": True,
        "ts": int(time() * 1000),
        "version": _VERSION,
        "mode": "prod" if settings.env == "prod" else "dev",
    }


@router.get("/readyz")
async def readyz(
    repos: Annotated[Repositories, Depends(get_repositories)],
) -> dict[str, Any]:
    settings = get_settings()
    repositories_ok = _repositories_available(repos)
    db_ok = None if not settings.enable_persistence else False
    llm_ready = await _llm_ready(settings.llm_provider)
    ready = repositories_ok and llm_ready and (db_ok is not False)

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
            "llm_ready": llm_ready,
        },
    }


def _repositories_available(repos: Repositories) -> bool:
    return all(getattr(repos, field, None) is not None for field in _REPOSITORY_FIELDS)


async def _llm_ready(llm_provider: str) -> bool:
    client = make_llm_client(llm_provider)
    if client.name() != "mock":
        return bool(getattr(client, "api_key", "")) and bool(getattr(client, "base_url", "")) and bool(
            getattr(client, "model", "")
        )

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
