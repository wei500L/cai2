from functools import lru_cache
from os import getenv
from typing import Literal

from pydantic import BaseModel, ConfigDict

_DEV_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


class Settings(BaseModel):
    model_config = ConfigDict(strict=True)

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"
    llm_provider: Literal["mock", "openai", "claude"] = "mock"
    enable_persistence: bool = False
    cors_extra_origins: str = ""
    ws_path: str = "/ws"
    rest_prefix: str = "/debug/v1"
    reconnect_catchup_max: int = 50

    def allowed_cors_origins(self) -> list[str]:
        origins = [*_DEV_CORS_ORIGINS]
        for origin in self.cors_extra_origins.split(","):
            normalized = origin.strip()
            if normalized and normalized not in origins:
                origins.append(normalized)
        return origins


def _read_literal(name: str, default: str, allowed: set[str]) -> str:
    value = getenv(name, default)
    return value if value in allowed else default


def _read_bool(name: str, default: bool) -> bool:
    raw = getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _read_int(name: str, default: int) -> int:
    raw = getenv(name)
    if raw is None:
        return default

    try:
        return int(raw.strip())
    except ValueError:
        return default


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        env=_read_literal("ENV", "dev", {"dev", "test", "prod"}),
        log_level=getenv("LOG_LEVEL", "INFO"),
        llm_provider=_read_literal("LLM_PROVIDER", "mock", {"mock", "openai", "claude"}),
        enable_persistence=_read_bool("ENABLE_PERSISTENCE", False),
        cors_extra_origins=getenv("EXTRA_CORS_ORIGINS", ""),
        ws_path=getenv("WS_PATH", "/ws"),
        rest_prefix=getenv("REST_PREFIX", "/debug/v1"),
        reconnect_catchup_max=max(10, _read_int("RECONNECT_CATCHUP_MAX", 50)),
    )
