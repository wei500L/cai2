from __future__ import annotations

import asyncio
import json
from typing import Any

from app.llm.client import LLMRequest, LLMResponse


class MockLLMClient:
    def __init__(
        self,
        *,
        deterministic_output: dict[str, Any] | None = None,
        latency_ms: int = 0,
    ) -> None:
        self._deterministic_output = deterministic_output
        self._next_output: dict[str, Any] | None = None
        self._latency_ms = latency_ms

    async def call_settlement_model(self, request: LLMRequest) -> LLMResponse:
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000)

        output = self._consume_output(request)
        return LLMResponse(
            content=json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            model=self.name(),
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=self._latency_ms,
            raw=output,
        )

    def name(self) -> str:
        return "mock"

    def set_next_output(self, output: dict[str, Any]) -> None:
        self._next_output = output

    def _consume_output(self, request: LLMRequest) -> dict[str, Any]:
        if self._next_output is not None:
            output = self._next_output
            self._next_output = None
            return output
        if self._deterministic_output is not None:
            return self._deterministic_output
        return _default_settlement_output(request.user)


def _default_settlement_output(user_prompt: str) -> dict[str, Any]:
    prompt = user_prompt.lower()
    primary = _pick_faction(prompt, fallback="ironCrown")
    secondary = _pick_counterparty(prompt, primary)

    relationship_delta = -8.0 if _contains_any(prompt, ("attack", "军令", "进攻", "威胁")) else 6.0
    secondary_delta = 4.0 if _contains_any(prompt, ("treaty", "条约", "trade", "贸易")) else None

    relationship_deltas = [
        {
            "from_faction": primary,
            "to_faction": secondary,
            "delta": relationship_delta,
            "reason": "本回合行动改变了双方互信。",
        }
    ]
    if secondary_delta is not None:
        relationship_deltas.append(
            {
                "from_faction": secondary,
                "to_faction": primary,
                "delta": secondary_delta,
                "reason": "条约或贸易信号带来有限缓和。",
            }
        )

    ai_speeches = []
    if _contains_any(prompt, ("speech", "演讲", "public", "公开")):
        ai_speeches.append(
            {
                "faction_id": secondary,
                "kind": "reaction",
                "content": "我方将审慎评估局势, 并要求各方保持克制。",
                "target_faction": primary,
                "internal_thought": (
                    "公开保持克制, 但我会把本回合的试探记录进账本, "
                    "等局势更清楚时再决定是否反制。"
                ),
            }
        )

    culture_impacts = []
    if _contains_any(prompt, ("culture", "文化", "宣传", "信仰")):
        culture_impacts.append(
            {
                "faction_id": primary,
                "delta": 2.0,
                "reason": "公开叙事提升了本阵营的文化影响。",
            }
        )

    morale_impacts = []
    if _contains_any(prompt, ("morale", "士气", "victory", "胜利")):
        morale_impacts.append(
            {
                "faction_id": primary,
                "delta": 0.05,
                "reason": "行动被解读为主动掌控局势。",
            }
        )

    narrative_events = [
        {
            "kind": "custom",
            "actor": primary,
            "target": secondary,
            "narration": "各势力在本回合的表态后重新评估边境与盟约风险。",
        }
    ]
    if _contains_any(prompt, ("intel", "情报", "spy", "侦察")):
        narrative_events.append(
            {
                "kind": "intel_leak",
                "actor": primary,
                "target": secondary,
                "narration": "隐秘情报的流动让部分外交承诺显得不再稳固。",
            }
        )

    return {
        "relationship_deltas": relationship_deltas,
        "ai_speeches": ai_speeches,
        "treaty_decisions": [],
        "military_judgements": [],
        "culture_impacts": culture_impacts,
        "morale_impacts": morale_impacts,
        "narrative_events": narrative_events,
        "map_change_suggestions": [],
        "stat_change_suggestions": [],
    }


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _pick_faction(prompt: str, *, fallback: str) -> str:
    for faction_id in _FACTION_IDS:
        if faction_id.lower() in prompt:
            return faction_id
    return fallback


def _pick_counterparty(prompt: str, primary: str) -> str:
    for faction_id in _FACTION_IDS:
        if faction_id != primary and faction_id.lower() in prompt:
            return faction_id
    return "starlight" if primary != "starlight" else "ironCrown"


_FACTION_IDS = (
    "ironCrown",
    "starlight",
    "emerald",
    "ashen",
    "voidChurch",
    "aurora",
    "magma",
    "darkTide",
)
