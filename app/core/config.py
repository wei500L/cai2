import json
from functools import lru_cache
from os import getenv
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.enums import GamePhase

_DEV_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")
_ROOM_PHASE_DURATIONS_DEFAULT = {
    GamePhase.observe: 10_000,
    GamePhase.action: 60_000,
    GamePhase.resolve: 8_000,
    GamePhase.arbitrate: 12_000,
}


class RoomSettings(BaseModel):
    model_config = ConfigDict(strict=True, validate_assignment=True)

    phase_durations: dict[GamePhase, int] = Field(
        default_factory=lambda: dict(_ROOM_PHASE_DURATIONS_DEFAULT)
    )
    turns_per_epoch: int = 20
    max_epochs: int = 5

    @field_validator("phase_durations")
    @classmethod
    def _validate_phase_durations(cls, value: dict[GamePhase, int]) -> dict[GamePhase, int]:
        missing = [phase.value for phase in GamePhase if phase not in value]
        if missing:
            raise ValueError(f"missing phase durations for: {', '.join(missing)}")

        for phase, duration in value.items():
            if duration <= 0:
                raise ValueError(f"phase duration for {phase.value} must be positive")
        return value

    @field_validator("turns_per_epoch", "max_epochs")
    @classmethod
    def _validate_positive_int(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("value must be positive")
        return value


class Settings(BaseModel):
    model_config = ConfigDict(strict=True)

    env: Literal["dev", "development", "test", "prod"] = "dev"
    log_level: str = "INFO"
    llm_provider: Literal["mock", "openai", "claude"] = "mock"
    dev_banner_enabled: bool = True
    enable_persistence: bool = False
    cors_extra_origins: str = ""
    ws_path: str = "/ws"
    rest_prefix: str = "/debug/v1"
    reconnect_catchup_max: int = 50
    room_settings: RoomSettings = Field(default_factory=RoomSettings)

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


def _read_positive_int(name: str, default: int) -> int:
    value = _read_int(name, default)
    return value if value > 0 else default


def _read_room_phase_durations(name: str, default: dict[GamePhase, int]) -> dict[GamePhase, int]:
    raw = getenv(name)
    if raw is None:
        return dict(default)

    normalized = raw.strip()
    if not normalized:
        return dict(default)

    overrides: dict[GamePhase, int] = {}
    if normalized.startswith("{"):
        try:
            parsed = json.loads(normalized)
        except ValueError:
            return dict(default)
        if not isinstance(parsed, dict):
            return dict(default)
        items = parsed.items()
    else:
        items: list[tuple[str, object]] = []
        for entry in normalized.split(","):
            part = entry.strip()
            if not part or "=" not in part:
                continue
            key, value = part.split("=", 1)
            items.append((key.strip(), value.strip()))

    for key, value in items:
        try:
            phase = GamePhase(str(key))
        except ValueError:
            continue

        try:
            duration = int(str(value).strip())
        except ValueError:
            continue

        if duration > 0:
            overrides[phase] = duration

    merged = dict(default)
    merged.update(overrides)
    return merged


def _read_room_settings() -> RoomSettings:
    defaults = RoomSettings()
    return RoomSettings(
        phase_durations=_read_room_phase_durations(
            "ROOM_PHASE_DURATIONS",
            defaults.phase_durations,
        ),
        turns_per_epoch=_read_positive_int("ROOM_TURNS_PER_EPOCH", defaults.turns_per_epoch),
        max_epochs=_read_positive_int("ROOM_MAX_EPOCHS", defaults.max_epochs),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        env=_read_literal("ENV", "dev", {"dev", "development", "test", "prod"}),
        log_level=getenv("LOG_LEVEL", "INFO"),
        llm_provider=_read_literal("LLM_PROVIDER", "mock", {"mock", "openai", "claude"}),
        dev_banner_enabled=_read_bool("DEV_BANNER_ENABLED", True),
        enable_persistence=_read_bool("ENABLE_PERSISTENCE", False),
        cors_extra_origins=getenv("EXTRA_CORS_ORIGINS", ""),
        ws_path=getenv("WS_PATH", "/ws"),
        rest_prefix=getenv("REST_PREFIX", "/debug/v1"),
        reconnect_catchup_max=max(10, _read_int("RECONNECT_CATCHUP_MAX", 50)),
        room_settings=_read_room_settings(),
    )
