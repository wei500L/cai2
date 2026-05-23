from __future__ import annotations

from app.llm.client import LLMRequest
from app.llm.real_client import RealLLMClient


class ClaudeCompatibleClient(RealLLMClient):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_s: float = 8.0,
    ) -> None:
        super().__init__(api_key=api_key, base_url=base_url, model=model, timeout_s=timeout_s)

    def _endpoint(self) -> str:
        return f"{self.base_url}/messages"

    def _build_payload(self, request: LLMRequest) -> dict[str, object]:
        return {
            "model": self.model,
            "system": request.system,
            "messages": [{"role": "user", "content": request.user}],
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "response_format": {"type": "json_object"},
        }

    def name(self) -> str:
        return "claude"
