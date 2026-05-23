from __future__ import annotations

import asyncio
import json
from hashlib import sha256
from typing import Any

from app.llm.client import LLMRequest, LLMResponse
from app.llm.explosion_prompt import parse_explosion_prompt
from app.llm.output_schema import ExplosionJudgeOutput


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

    async def call_explosion_judge(self, prompt: str) -> LLMResponse:
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000)

        output = self._consume_explosion_output(prompt)
        return LLMResponse(
            content=json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            model=self.name(),
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=self._latency_ms,
            raw=output,
        )

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

    def _consume_explosion_output(self, prompt: str) -> dict[str, Any]:
        if self._next_output is not None and _looks_like_explosion_output(self._next_output):
            output = self._next_output
            self._next_output = None
            return output
        if self._deterministic_output is not None and _looks_like_explosion_output(
            self._deterministic_output
        ):
            return self._deterministic_output

        context = parse_explosion_prompt(prompt)
        center_hex_id = str(context.get("center_hex_id") or "")
        kind = str(context.get("kind") or "conventional")
        nodes = context.get("subgraph", {}).get("nodes", [])
        candidates = [
            str(node.get("hex_id"))
            for node in nodes
            if isinstance(node, dict) and node.get("hex_id")
        ]
        output = {
            "affected_hex_ids": _select_affected(center_hex_id, kind, candidates),
            "primary_hex_id": center_hex_id,
            "scorched_turns": _mock_turns(kind),
            "fallout_severity": _mock_fallout(kind),
            "economic_loss_pct": _mock_loss(kind),
            "narrative_hint": _mock_hint(center_hex_id, kind),
        }
        ExplosionJudgeOutput.model_validate(output)
        return output


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


def _looks_like_explosion_output(payload: dict[str, Any]) -> bool:
    return {"affected_hex_ids", "primary_hex_id", "scorched_turns"} <= set(payload)


def _select_affected(center_hex_id: str, kind: str, candidates: list[str]) -> list[str]:
    limit = {
        "nuke": 8,
        "conventional": 4,
        "aerial": 3,
        "naval": 5,
        "artillery": 4,
        "missile": 6,
        "other": 2,
    }.get(kind, 4)
    seed = f"{center_hex_id}:{kind}"
    ordered = sorted(
        {candidate for candidate in candidates if candidate},
        key=lambda candidate: (
            int(sha256(f"{seed}:{candidate}".encode()).hexdigest()[:12], 16),
            candidate,
        ),
    )
    selected = [center_hex_id]
    for candidate in ordered:
        if candidate == center_hex_id or candidate in selected:
            continue
        selected.append(candidate)
        if len(selected) >= limit:
            break
    return selected[:limit]


def _mock_turns(kind: str) -> int:
    return {
        "nuke": 5,
        "conventional": 2,
        "aerial": 1,
        "naval": 0,
        "artillery": 1,
        "missile": 3,
        "other": 1,
    }.get(kind, 2)


def _mock_fallout(kind: str) -> float:
    return {
        "nuke": 0.6,
        "conventional": 0.0,
        "aerial": 0.12,
        "naval": 0.0,
        "artillery": 0.05,
        "missile": 0.2,
        "other": 0.02,
    }.get(kind, 0.0)


def _mock_loss(kind: str) -> float:
    return {
        "nuke": 0.35,
        "conventional": 0.12,
        "aerial": 0.08,
        "naval": 0.04,
        "artillery": 0.1,
        "missile": 0.2,
        "other": 0.05,
    }.get(kind, 0.1)


def _mock_hint(center_hex_id: str, kind: str) -> str:
    return f"{kind} strike centered on {center_hex_id}"
