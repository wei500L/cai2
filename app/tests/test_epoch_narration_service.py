from __future__ import annotations

import json

import pytest

from app.core.errors import DiplomacyError
from app.domain.enums import FactionId
from app.llm.client import LLMRequest, LLMResponse
from app.llm.mock_client import MockLLMClient
from app.protocol.narration_events import (
    EpicNarrationPayload,
    SummaryHighlightBattlePayload,
    SummaryHighlightBetrayalPayload,
    SummaryHighlightBundlePayload,
    SummaryHighlightMajorEventPayload,
    SummaryNarrationPayload,
    SummaryRankingRowPayload,
)
from app.services.epoch_narration_service import (
    EpochNarrationState,
    generate_epic_narration,
    generate_summary_narration,
)


class FailingNarrationClient:
    async def call_epic_narration(self, request: LLMRequest) -> LLMResponse:
        raise RuntimeError("epic failed")

    async def call_summary_narration(self, request: LLMRequest) -> LLMResponse:
        raise RuntimeError("summary failed")

    def name(self) -> str:
        return "failing"


class FencedNarrationClient:
    async def call_epic_narration(self, request: LLMRequest) -> LLMResponse:
        payload = {
            "narrative": (
                "铁冠帝国的旗帜在风暴中升起，星辉联邦的辩辞仍在回荡，而翡翠王庭的转向让所有旧盟约都蒙上阴影。"
                "边境的炮火、密谈的余波与背叛的沉默，把整个纪元推向更冷峻的方向。"
                "旧秩序没有立刻崩塌，但每一条裂缝都在扩大，所有势力都开始重新计算联盟、威慑与复仇的代价。"
                "这一段继续扩展到足够长度，确保模型输出满足长度约束，并且可以被解析为严格 JSON。"
                "纪元史官记下的不是一句口号，而是无数势力在观望、误判和修正中留下的痕迹。"
                "每一条消息都在改变筹码，每一次克制都在积累下一轮冲突的爆点。"
            ),
            "tone": "肃杀",
            "key_events": ["铁冠帝国发动边境攻势", "星辉联邦公开演讲反击"],
        }
        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            model="mock",
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=0,
        )

    async def call_summary_narration(self, request: LLMRequest) -> LLMResponse:
        payload = {
            "headline": "铁冠领跑，旧盟瓦解",
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
                "wars": [],
                "betrayals": [],
            },
        }
        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            model="mock",
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=0,
        )

    def name(self) -> str:
        return "fenced"


def _state() -> EpochNarrationState:
    return EpochNarrationState(
        room_id="room-1",
        epoch=3,
        turn=8,
        generated_at_ms=12_345,
        faction_stats_summary_text="ironCrown | 120 | 90 | 50 | 40 | 1.0 | 85.0 | stable",
        tone="肃杀",
        key_events=[
            "铁冠帝国发动边境攻势",
            "星辉联邦发表公开演讲",
            "翡翠王庭转向新盟约",
        ],
        rankings=[
            SummaryRankingRowPayload(
                id=FactionId.ironCrown,
                name="铁冠帝国",
                totalPower=92.4,
                previousRank=2,
                currentRank=1,
                rankDelta=1,
                previousPower=86.2,
            ),
            SummaryRankingRowPayload(
                id=FactionId.starlight,
                name="星辉联邦",
                totalPower=87.1,
                previousRank=1,
                currentRank=2,
                rankDelta=-1,
                previousPower=90.3,
            ),
        ],
        highlights=SummaryHighlightBundlePayload(
            majorEvents=[
                SummaryHighlightMajorEventPayload(
                    id="event-1",
                    kind="speech",
                    turn=8,
                    priority="P1",
                    actor=FactionId.ironCrown,
                    target=FactionId.starlight,
                    narration="铁冠帝国发表公开演讲。",
                )
            ],
            wars=[
                SummaryHighlightBattlePayload(
                    id="battle-1",
                    kind="battle",
                    turn=8,
                    priority="P0",
                    actor=FactionId.ironCrown,
                    target=FactionId.starlight,
                    regionId="region-1",
                    attackerLoss=2.0,
                    defenderLoss=4.0,
                    attackerRemainingTroops=14.0,
                    defenderRemainingTroops=10.0,
                    narration="边境爆发战争。",
                )
            ],
            betrayals=[
                SummaryHighlightBetrayalPayload(
                    id="betrayal-1",
                    kind="betrayal",
                    turn=8,
                    priority="P1",
                    actor=FactionId.starlight,
                    target=FactionId.emerald,
                    narration="翡翠王庭突然倒向新盟约。",
                )
            ],
        ),
    )


@pytest.mark.asyncio
async def test_generate_epic_narration_with_mock_llm_is_deterministic() -> None:
    state = _state()

    payload = await generate_epic_narration(state, MockLLMClient())

    assert isinstance(payload, EpicNarrationPayload)
    assert payload.source == "llm"
    assert len(payload.narrative) >= 200
    assert payload.keyEvents
    assert payload.tone in {"肃杀", "激荡", "阴郁", "史诗"}


@pytest.mark.asyncio
async def test_generate_summary_narration_with_mock_llm_keeps_war_and_speech_highlights() -> None:
    state = _state()

    payload = await generate_summary_narration(state, MockLLMClient())

    assert isinstance(payload, SummaryNarrationPayload)
    assert payload.source == "llm"
    assert payload.headline
    assert payload.highlights.wars
    assert any(event.kind == "speech" for event in payload.highlights.majorEvents)


@pytest.mark.asyncio
async def test_generate_narrations_raise_on_llm_failure() -> None:
    state = _state()
    client = FailingNarrationClient()

    with pytest.raises(DiplomacyError, match="failed to generate epic narration"):
        await generate_epic_narration(state, client)

    with pytest.raises(DiplomacyError, match="failed to generate summary narration"):
        await generate_summary_narration(state, client)


@pytest.mark.asyncio
async def test_generate_narrations_accept_fenced_json_output() -> None:
    state = _state()
    client = FencedNarrationClient()

    epic = await generate_epic_narration(state, client)
    summary = await generate_summary_narration(state, client)

    assert epic.source == "llm"
    assert "铁冠帝国的旗帜" in epic.narrative
    assert summary.source == "llm"
    assert summary.headline == "铁冠领跑，旧盟瓦解"
    assert summary.highlights.wars == []


@pytest.mark.asyncio
async def test_generate_summary_narration_metadata_is_stable() -> None:
    state = _state()
    payload = await generate_summary_narration(state, MockLLMClient())

    assert payload.generatedAtMs == state.generated_at_ms
    assert payload.rankings[0].name == "铁冠帝国"
