from __future__ import annotations

from app.llm.client import LLMClient, LLMRequest, LLMResponse


class OpenAICompatibleClient(LLMClient):
    """未来用 httpx + chat/completions endpoint 接入。"""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_s: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.timeout_s = timeout_s

    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        raise NotImplementedError(
            "openai client pending wiring; provide api adapter in production"
        )

    def name(self) -> str:
        return "openai"
