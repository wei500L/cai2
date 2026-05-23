from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib import request as urllib_request

from pydantic import BaseModel

from app.llm.client import LLMRequest, LLMResponse
from app.llm.mock_client import MockLLMClient
from app.llm.output_schema import (
    EpicNarrationModelOutput,
    ExplosionJudgeOutput,
    SettlementModelOutput,
    SummaryNarrationModelOutput,
)


class RealLLMClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_s: float = 8.0,
        fallback_client: MockLLMClient | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self._fallback_client = fallback_client or MockLLMClient()

    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        return await self._call_json_model(
            request,
            schema=SettlementModelOutput,
            retries=1,
            payload_kind="settlement",
        )

    async def call_epic_narration(self, request: LLMRequest) -> LLMResponse:
        return await self._call_json_model(
            request,
            schema=EpicNarrationModelOutput,
            retries=2,
            payload_kind="epic_narration",
        )

    async def call_summary_narration(self, request: LLMRequest) -> LLMResponse:
        return await self._call_json_model(
            request,
            schema=SummaryNarrationModelOutput,
            retries=2,
            payload_kind="summary_narration",
        )

    async def call_explosion_judge(self, prompt: str) -> LLMResponse:
        request = LLMRequest(
            system=self._explosion_system_prompt(),
            user=prompt,
            temperature=0.0,
            max_tokens=1024,
            metadata={"kind": "explosion"},
        )
        return await self._call_json_model(
            request,
            schema=ExplosionJudgeOutput,
            retries=3,
            payload_kind="explosion",
        )

    async def _call_json_model(
        self,
        request: LLMRequest,
        *,
        schema: type[BaseModel],
        retries: int,
        payload_kind: str,
    ) -> LLMResponse:
        if not self._can_call_real():
            return await self._fallback_response(request, payload_kind)

        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response_text, raw_response, latency_ms = await asyncio.wait_for(
                    self._perform_request(request),
                    timeout=self.timeout_s,
                )
                payload = self._validate_schema(response_text, schema)
                content = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                return LLMResponse(
                    content=content,
                    model=self.name(),
                    prompt_tokens=_extract_int(raw_response, "usage", "prompt_tokens"),
                    completion_tokens=_extract_int(raw_response, "usage", "completion_tokens"),
                    latency_ms=latency_ms,
                    raw=raw_response,
                )
            except Exception as error:
                last_error = error
                if attempt >= retries:
                    break
                delay_s = 0.2 * (2**attempt)
                if delay_s > 0:
                    await asyncio.sleep(delay_s)

        if last_error is not None:
            return await self._fallback_response(request, payload_kind)
        return await self._fallback_response(request, payload_kind)

    async def _fallback_response(self, request: LLMRequest, payload_kind: str) -> LLMResponse:
        if payload_kind == "explosion":
            return await self._fallback_client.call_explosion_judge(request.user)
        if payload_kind == "epic_narration":
            return await self._fallback_client.call_epic_narration(request)
        if payload_kind == "summary_narration":
            return await self._fallback_client.call_summary_narration(request)
        return await self._fallback_client.call_settlement_model(request)

    def _can_call_real(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)

    def _explosion_system_prompt(self) -> str:
        return "你是战场范围判定模型, 只输出严格 JSON."

    async def _perform_request(self, request: LLMRequest) -> tuple[str, dict[str, Any], int]:
        payload = self._build_payload(request)
        headers = self._build_headers()
        raw_response: dict[str, Any] = {}

        def _blocking_call() -> tuple[str, dict[str, Any], int]:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            req = urllib_request.Request(
                self._endpoint(),
                data=body,
                headers=headers,
                method="POST",
            )
            with urllib_request.urlopen(req, timeout=self.timeout_s) as response:
                response_bytes = response.read()
                response_text = response_bytes.decode("utf-8")
                parsed = json.loads(response_text)
                return _extract_response_text(parsed), parsed, 0

        response_text, raw_response, latency_ms = await asyncio.to_thread(_blocking_call)
        return response_text, raw_response, latency_ms

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, request: LLMRequest) -> dict[str, Any]:
        raise NotImplementedError

    def _endpoint(self) -> str:
        raise NotImplementedError

    def _validate_schema(self, text: str, schema: type[BaseModel]) -> dict[str, Any]:
        stripped = text.strip()
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1 and end > start:
            stripped = stripped[start : end + 1]
        data = json.loads(stripped)
        validated = schema.model_validate(data)
        return validated.model_dump(mode="json")

    def name(self) -> str:
        return "real"


def _extract_response_text(raw_response: dict[str, Any]) -> str:
    if isinstance(raw_response.get("choices"), list):
        choices = raw_response["choices"]
        if choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return message["content"]
                if isinstance(first.get("text"), str):
                    return first["text"]
    if isinstance(raw_response.get("content"), str):
        return str(raw_response["content"])
    if isinstance(raw_response.get("content"), list):
        chunks: list[str] = []
        for item in raw_response["content"]:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                chunks.append(item["text"])
        if chunks:
            return "".join(chunks)
    return json.dumps(raw_response, ensure_ascii=False)


def _extract_int(raw_response: dict[str, Any], *path: str) -> int | None:
    current: Any = raw_response
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    if isinstance(current, int):
        return current
    return None
