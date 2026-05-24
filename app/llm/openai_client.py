from __future__ import annotations

from app.llm.client import LLMRequest
from app.llm.real_client import RealLLMClient


class OpenAICompatibleClient(RealLLMClient):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_s: float = 60.0,
    ) -> None:
        super().__init__(api_key=api_key, base_url=base_url, model=model, timeout_s=timeout_s)

    def _endpoint(self) -> str:
        return f"{self.base_url}/chat/completions"

    def _build_payload(self, request: LLMRequest) -> dict[str, object]:
        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.user},
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "response_format": {"type": "json_object"},
        }

    def name(self) -> str:
        return "openai"
