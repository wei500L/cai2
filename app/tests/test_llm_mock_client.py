from __future__ import annotations

import json

import pytest

from app.llm.claude_client import ClaudeCompatibleClient
from app.llm.client import LLMRequest, LLMResponse
from app.llm.factory import make_llm_client
from app.llm.mock_client import MockLLMClient
from app.llm.openai_client import OpenAICompatibleClient
from app.llm.output_schema import SettlementModelOutput
from app.llm.retry import call_with_retry


@pytest.fixture()
def llm_request() -> LLMRequest:
    return LLMRequest(
        system="settlement system",
        user="ironCrown speech treaty intel morale culture starlight",
        temperature=0.6,
        max_tokens=4000,
    )


@pytest.mark.asyncio
async def test_mock_default_output_is_json(llm_request: LLMRequest) -> None:
    response = await MockLLMClient().call_settlement_model(llm_request)

    payload = json.loads(response.content)

    assert response.model == "mock"
    assert payload["relationship_deltas"]
    assert isinstance(payload["ai_speeches"], list)
    assert payload["treaty_decisions"] == []
    assert payload["military_judgements"] == []
    assert isinstance(payload["culture_impacts"], list)
    assert isinstance(payload["morale_impacts"], list)
    assert payload["narrative_events"]
    assert payload["map_change_suggestions"] == []
    assert payload["stat_change_suggestions"] == []
    assert SettlementModelOutput.model_validate(payload).relationship_deltas


@pytest.mark.asyncio
async def test_set_next_output_injects_once(llm_request: LLMRequest) -> None:
    client = MockLLMClient()
    injected = {"relationship_deltas": [], "narrative_events": [{"kind": "custom"}]}

    client.set_next_output(injected)
    first = await client.call_settlement_model(llm_request)
    second = await client.call_settlement_model(llm_request)

    assert json.loads(first.content) == injected
    assert json.loads(second.content) != injected


@pytest.mark.asyncio
async def test_zero_latency_returns_without_sleep(llm_request: LLMRequest) -> None:
    response = await MockLLMClient(latency_ms=0).call_settlement_model(llm_request)

    assert response.latency_ms == 0


@pytest.mark.asyncio
async def test_call_with_retry_succeeds_on_second_attempt(llm_request: LLMRequest) -> None:
    client = FailOnceClient()

    response = await call_with_retry(client, llm_request, max_retries=1, base_delay_ms=0)

    assert response.content == "{}"
    assert client.calls == 2


@pytest.mark.asyncio
async def test_call_with_retry_raises_original_after_limit(llm_request: LLMRequest) -> None:
    error = RuntimeError("still failing")
    client = AlwaysFailClient(error)

    with pytest.raises(RuntimeError) as exc_info:
        await call_with_retry(client, llm_request, max_retries=1, base_delay_ms=0)

    assert exc_info.value is error
    assert client.calls == 2


@pytest.mark.asyncio
async def test_openai_and_claude_clients_fallback_to_mock(llm_request: LLMRequest) -> None:
    openai = OpenAICompatibleClient(api_key="", base_url="https://example.invalid", model="m")
    claude = ClaudeCompatibleClient(api_key="", base_url="https://example.invalid", model="m")

    assert (await openai.call_settlement_model(llm_request)).model == "mock"
    assert (await claude.call_settlement_model(llm_request)).model == "mock"


def test_make_llm_client_mock_returns_mock() -> None:
    assert isinstance(make_llm_client("mock"), MockLLMClient)


def test_make_llm_client_openai_and_claude_are_wired() -> None:
    assert isinstance(make_llm_client("openai"), OpenAICompatibleClient)
    assert isinstance(make_llm_client("claude"), ClaudeCompatibleClient)


class FailOnceClient:
    def __init__(self) -> None:
        self.calls = 0

    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("temporary")
        return LLMResponse(
            content="{}",
            model="fake",
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=0,
            raw={},
        )

    def name(self) -> str:
        return "fail-once"


class AlwaysFailClient:
    def __init__(self, error: RuntimeError) -> None:
        self.calls = 0
        self._error = error

    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        raise self._error

    def name(self) -> str:
        return "always-fail"
