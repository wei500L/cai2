from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProtocolEnvelope(BaseModel):
    model_config = ConfigDict(strict=True)

    message_id: str
    kind: str
    created_at_ms: int
    room_id: str | None = None
    seq: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

