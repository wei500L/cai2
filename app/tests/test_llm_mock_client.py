"""Mock LLM client tests."""
# ruff: noqa: I001, E501

from __future__ import annotations

import json

import pytest

from app.llm.claude_client import ClaudeCompatibleClient
from app.llm.client import LLMRequest, LLMResponse
from app.llm.factory import make_llm_client
from app.llm.mock_client import MockLLMClient
from app.llm.openai_client import OpenAICompatibleClient
from app.llm.output_schema import EpicNarrationModelOutput, SettlementModelOutput, SummaryNarrationModelOutput
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
async def test_mock_epic_narration_is_deterministic() -> None:
    request = LLMRequest(
        system="epic system",
        user="epoch=3 ironCrown starlight battle betrayal speech",
        temperature=0.7,
        max_tokens=720,
        metadata={
            "epoch_state": {
                "room_id": "room-1",
                "epoch": 3,
                "turn": 8,
                "generated_at_ms": 1_234,
                "tone": "肃杀",
                "key_events": ["铁冠帝国发动边境攻势", "星辉联邦公开演讲反击"],
                "rankings": [
                    {
                        "id": "ironCrown",
                        "name": "铁冠帝国",
                        "totalPower": 92.4,
                        "previousRank": 2,
                        "currentRank": 1,
                        "rankDelta": 1,
                        "previousPower": 86.2,
                    }
                ],
                "highlights": {
                    "majorEvents": [
                        {
                            "id": "event-1",
                            "kind": "speech",
                            "turn": 8,
                            "priority": "P1",
                            "actor": "ironCrown",
                            "target": "starlight",
                            "narration": "铁冠帝国发动边境攻势。",
                        }
                    ],
                    "wars": [
                        {
                            "id": "battle-1",
                            "kind": "battle",
                            "turn": 8,
                            "priority": "P0",
                            "actor": "ironCrown",
                            "target": "starlight",
                            "regionId": "region-1",
                            "attackerLoss": 2.0,
                            "defenderLoss": 4.0,
                            "attackerRemainingTroops": 14.0,
                            "defenderRemainingTroops": 10.0,
                            "narration": "边境爆发战争。",
                        }
                    ],
                    "betrayals": [
                        {
                            "id": "betrayal-1",
                            "kind": "betrayal",
                            "turn": 8,
                            "priority": "P1",
                            "actor": "starlight",
                            "target": "emerald",
                            "narration": "翡翠王庭突然倒向新盟约。",
                        }
                    ],
                },
            }
        },
    )

    response = await MockLLMClient().call_epic_narration(request)
    payload = json.loads(response.content)

    assert response.model == "mock"
    assert len(payload["narrative"]) >= 200
    assert payload["key_events"]
    assert payload["tone"] == "肃杀"
    assert EpicNarrationModelOutput.model_validate(payload)


@pytest.mark.asyncio
async def test_mock_summary_narration_is_deterministic() -> None:
    request = LLMRequest(
        system="summary system",
        user="epoch=3 ironCrown starlight battle betrayal speech",
        temperature=0.35,
        max_tokens=540,
        metadata={
            "epoch_state": {
                "room_id": "room-1",
                "epoch": 3,
                "turn": 8,
                "generated_at_ms": 1_234,
                "tone": "肃杀",
                "key_events": ["铁冠帝国发动边境攻势", "星辉联邦公开演讲反击"],
                "rankings": [
                    {
                        "id": "ironCrown",
                        "name": "铁冠帝国",
                        "totalPower": 92.4,
                        "previousRank": 2,
                        "currentRank": 1,
                        "rankDelta": 1,
                        "previousPower": 86.2,
                    }
                ],
                "highlights": {
                    "majorEvents": [
                        {
                            "id": "event-1",
                            "kind": "speech",
                            "turn": 8,
                            "priority": "P1",
                            "actor": "ironCrown",
                            "target": "starlight",
                            "narration": "铁冠帝国发表公开演讲。",
                        }
                    ],
                    "wars": [
                        {
                            "id": "battle-1",
                            "kind": "battle",
                            "turn": 8,
                            "priority": "P0",
                            "actor": "ironCrown",
                            "target": "starlight",
                            "regionId": "region-1",
                            "attackerLoss": 2.0,
                            "defenderLoss": 4.0,
                            "attackerRemainingTroops": 14.0,
                            "defenderRemainingTroops": 10.0,
                            "narration": "边境爆发战争。",
                        }
                    ],
                    "betrayals": [
                        {
                            "id": "betrayal-1",
                            "kind": "betrayal",
                            "turn": 8,
                            "priority": "P1",
                            "actor": "starlight",
                            "target": "emerald",
                            "narration": "翡翠王庭突然倒向新盟约。",
                        }
                    ],
                },
            }
        },
    )

    response = await MockLLMClient().call_summary_narration(request)
    payload = json.loads(response.content)

    assert response.model == "mock"
    assert payload["headline"]
    assert payload["rankings"]
    assert payload["highlights"]["wars"]
    assert payload["highlights"]["majorEvents"]
    assert SummaryNarrationModelOutput.model_validate_json(json.dumps(payload, ensure_ascii=False))


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
async def test_openai_and_claude_clients_raise_when_not_configured(
    llm_request: LLMRequest,
) -> None:
    openai = OpenAICompatibleClient(api_key="", base_url="https://example.invalid", model="m")
    claude = ClaudeCompatibleClient(api_key="", base_url="https://example.invalid", model="m")

    with pytest.raises(RuntimeError, match="LLM not configured"):
        await openai.call_settlement_model(llm_request)

    with pytest.raises(RuntimeError, match="LLM not configured"):
        await claude.call_settlement_model(llm_request)


def test_make_llm_client_mock_returns_mock() -> None:
    assert isinstance(make_llm_client("mock"), MockLLMClient)


def test_make_llm_client_openai_and_claude_are_wired(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_TIMEOUT_S", "17")

    openai = make_llm_client("openai")
    claude = make_llm_client("claude")

    assert isinstance(openai, OpenAICompatibleClient)
    assert isinstance(claude, ClaudeCompatibleClient)
    assert getattr(openai, "timeout_s", None) == 17.0
    assert getattr(claude, "timeout_s", None) == 17.0


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
