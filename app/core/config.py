from functools import lru_cache
from os import getenv
from typing import Literal

from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(strict=True)

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"
    llm_provider: Literal["mock", "openai", "claude"] = "mock"
    enable_persistence: bool = False


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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        env=_read_literal("ENV", "dev", {"dev", "test", "prod"}),
        log_level=getenv("LOG_LEVEL", "INFO"),
        llm_provider=_read_literal("LLM_PROVIDER", "mock", {"mock", "openai", "claude"}),
        enable_persistence=_read_bool("ENABLE_PERSISTENCE", False),
    )

