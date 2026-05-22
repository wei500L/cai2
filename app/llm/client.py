from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field


class LLMRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    system: str
    user: str
    temperature: float
    max_tokens: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class LLMResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    content: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: int
    raw: dict[str, Any] | None = None


class LLMClient(Protocol):
    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        ...

    def name(self) -> str:
        ...
