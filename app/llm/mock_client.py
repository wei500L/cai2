"""Deterministic mock LLM client."""
# ruff: noqa: RUF001, E501

from __future__ import annotations

import asyncio
import json
from hashlib import sha256
from typing import Any

from app.data.narration_templates import (
    EPIC_NARRATION_TEMPLATES,
    SUMMARY_HEADLINE_TEMPLATES,
    pick_template,
    pick_templates,
)
from app.domain.enums import FactionId
from app.llm.client import LLMRequest, LLMResponse
from app.llm.explosion_prompt import parse_explosion_prompt
from app.llm.output_schema import (
    EpicNarrationModelOutput,
    ExplosionJudgeOutput,
    OpeningNarrationModelOutput,
    SettlementModelOutput,
    SummaryNarrationModelOutput,
)


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

        output = self._consume_output(
            request,
            schema=SettlementModelOutput,
            default_factory=_default_settlement_output,
        )
        return LLMResponse(
            content=json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            model=self.name(),
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=self._latency_ms,
            raw=output,
        )

    async def call_epic_narration(self, request: LLMRequest) -> LLMResponse:
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000)

        output = self._consume_output(
            request,
            schema=EpicNarrationModelOutput,
            default_factory=_default_epic_narration_output,
        )
        return LLMResponse(
            content=json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            model=self.name(),
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=self._latency_ms,
            raw=output,
        )

    async def call_summary_narration(self, request: LLMRequest) -> LLMResponse:
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000)

        output = self._consume_output(
            request,
            schema=SummaryNarrationModelOutput,
            default_factory=_default_summary_narration_output,
        )
        return LLMResponse(
            content=json.dumps(output, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            model=self.name(),
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=self._latency_ms,
            raw=output,
        )

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

    async def call_opening_narration(self, request: LLMRequest) -> LLMResponse:
        if self._latency_ms > 0:
            await asyncio.sleep(self._latency_ms / 1000)

        output = self._consume_output(
            request,
            schema=OpeningNarrationModelOutput,
            default_factory=_default_opening_narration_output,
        )
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

    def _consume_output(
        self,
        request: LLMRequest,
        *,
        schema: type[Any],
        default_factory: Any,
    ) -> dict[str, Any]:
        if self._next_output is not None:
            output = self._next_output
            self._next_output = None
            return output

        for candidate in (self._deterministic_output,):
            if candidate is None:
                continue
            try:
                validated = schema.model_validate_json(
                    json.dumps(candidate, ensure_ascii=False, default=str)
                )
            except Exception:
                continue
            return validated.model_dump(mode="json")
        return default_factory(request)

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


def _default_settlement_output(request: LLMRequest) -> dict[str, Any]:
    prompt = request.user.lower()
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

    output = {
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
    SettlementModelOutput.model_validate(output)
    return output


def _default_epic_narration_output(request: LLMRequest) -> dict[str, Any]:
    state = _epoch_state_from_request(request)
    rankings = list(state.get("rankings") or [])
    highlights = _coerce_highlights(state.get("highlights"))
    key_events = list(state.get("key_events") or [])
    tone = str(state.get("tone") or _tone_from_epoch_state(state))
    epoch = int(state.get("epoch") or _extract_epoch(request.user) or 1)
    faction_name = _top_faction_name(rankings) or _pick_faction(request.user.lower(), fallback="ironCrown")
    seed = f"{request.user}:{epoch}:{tone}:{len(key_events)}"
    templates = pick_templates(EPIC_NARRATION_TEMPLATES, seed=seed, count=5)
    narrative_parts = [template.format(faction_name=faction_name, epoch=epoch) for template in templates]
    if key_events:
        narrative_parts.append("本纪元的关键落点包括：" + "；".join(key_events[:4]) + "。")
    war_count = len(highlights.get("wars") or [])
    betrayal_count = len(highlights.get("betrayals") or [])
    if war_count or betrayal_count:
        narrative_parts.append(f"战局与背约相互纠缠，战争 {war_count} 起、背叛 {betrayal_count} 起。")
    narrative = _ensure_epic_length("。".join(part.strip("。") for part in narrative_parts if part.strip()))
    output = {
        "narrative": narrative,
        "tone": tone,
        "key_events": key_events[:6] or [_default_key_event(faction_name, epoch)],
    }
    EpicNarrationModelOutput.model_validate(output)
    return output


def _default_summary_narration_output(request: LLMRequest) -> dict[str, Any]:
    state = _epoch_state_from_request(request)
    rankings = list(state.get("rankings") or [])
    highlights = _coerce_highlights(state.get("highlights"))
    key_events = list(state.get("key_events") or [])
    epoch = int(state.get("epoch") or _extract_epoch(request.user) or 1)
    faction_name = _top_faction_name(rankings) or _pick_faction(request.user.lower(), fallback="ironCrown")
    seed = f"{request.user}:{epoch}:{len(rankings)}:{len(highlights.get('wars') or [])}"
    headline_template = pick_template(SUMMARY_HEADLINE_TEMPLATES, seed=seed)
    headline = headline_template.format(faction_name=faction_name, epoch=epoch)
    if not rankings:
        rankings = _synthetic_rankings(seed=seed)
    if not highlights.get("majorEvents"):
        highlights["majorEvents"] = _synthetic_major_events(key_events, epoch, faction_name)
    if not highlights.get("wars"):
        highlights["wars"] = _synthetic_wars(key_events, epoch, faction_name)
    if not highlights.get("betrayals"):
        highlights["betrayals"] = _synthetic_betrayals(key_events, epoch, faction_name)
    output = {
        "headline": headline,
        "rankings": rankings,
        "highlights": highlights,
    }
    validated = SummaryNarrationModelOutput.model_validate_json(
        json.dumps(output, ensure_ascii=False, default=str)
    )
    return validated.model_dump(mode="json")


def _epoch_state_from_request(request: LLMRequest) -> dict[str, Any]:
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    epoch_state = metadata.get("epoch_state")
    if isinstance(epoch_state, dict):
        return epoch_state
    return {}


def _extract_epoch(text: str) -> int | None:
    for token in text.replace("=", " ").replace("：", " ").split():
        if token.isdigit():
            try:
                value = int(token)
            except ValueError:
                continue
            if 0 < value < 100:
                return value
    return None


def _top_faction_name(rankings: list[dict[str, Any]]) -> str | None:
    if not rankings:
        return None
    top = rankings[0]
    name = top.get("name")
    if isinstance(name, str) and name:
        return name
    faction_id = top.get("id")
    if isinstance(faction_id, str) and faction_id in _FACTION_NAME_BY_ID:
        return _FACTION_NAME_BY_ID[faction_id]
    return str(faction_id) if faction_id is not None else None


def _tone_from_epoch_state(state: dict[str, Any]) -> str:
    highlights = state.get("highlights")
    if isinstance(highlights, dict):
        war_count = len(highlights.get("wars") or [])
        betrayal_count = len(highlights.get("betrayals") or [])
        if war_count and betrayal_count:
            return "肃杀"
        if war_count >= 2:
            return "激荡"
        if betrayal_count >= 2:
            return "阴郁"
    return "史诗"


def _ensure_epic_length(text: str) -> str:
    if len(text) < 200:
        text = f"{text} 这不是轻巧的收束，而是将旧秩序、公开演讲、战争和背叛一起压进纪元的封口。"
    if len(text) < 200:
        text = f"{text} 纪元的余波仍在各方边界回荡，新的结盟与报复已在暗处成形。"
    if len(text) > 600:
        text = text[:599].rstrip("。") + "。"
    return text


def _default_key_event(faction_name: str, epoch: int) -> str:
    return f"{faction_name} 在纪元 {epoch} 的权力排序中留下了决定性一笔。"


def _coerce_highlights(value: Any) -> dict[str, list[dict[str, Any]]]:
    if not isinstance(value, dict):
        return {"majorEvents": [], "wars": [], "betrayals": []}
    return {
        "majorEvents": list(value.get("majorEvents") or []),
        "wars": list(value.get("wars") or []),
        "betrayals": list(value.get("betrayals") or []),
    }


def _synthetic_rankings(seed: str) -> list[dict[str, Any]]:
    powers = []
    for index, faction_id in enumerate(_FACTION_IDS, start=1):
        digest = sha256(f"{seed}:{faction_id}".encode()).hexdigest()
        total_power = 80 + (int(digest[:6], 16) % 70)
        powers.append((faction_id, float(total_power), index))
    ordered = sorted(powers, key=lambda item: (-item[1], item[0]))
    rows: list[dict[str, Any]] = []
    for rank, (faction_id, total_power, base_index) in enumerate(ordered, start=1):
        previous_rank = ((rank + base_index - 1) % len(_FACTION_IDS)) + 1
        rows.append(
            {
                "id": _faction_enum(faction_id),
                "name": _FACTION_NAME_BY_ID[faction_id],
                "totalPower": round(total_power, 1),
                "previousRank": previous_rank,
                "currentRank": rank,
                "rankDelta": previous_rank - rank,
                "previousPower": round(max(0.0, total_power - 4.5), 1),
            }
        )
    return rows


def _synthetic_major_events(
    key_events: list[str],
    epoch: int,
    faction_name: str,
) -> list[dict[str, Any]]:
    base_text = key_events[0] if key_events else _default_key_event(faction_name, epoch)
    return [
        {
            "id": f"fallback-major-{epoch}",
            "kind": "speech",
            "turn": epoch,
            "priority": "P1",
            "actor": _faction_enum(_FACTION_IDS[0]),
            "target": _faction_enum(_FACTION_IDS[1]),
            "narration": base_text,
        }
    ]


def _synthetic_wars(
    key_events: list[str],
    epoch: int,
    faction_name: str,
) -> list[dict[str, Any]]:
    base_text = key_events[0] if key_events else _default_key_event(faction_name, epoch)
    attacker = _FACTION_IDS[0]
    defender = _FACTION_IDS[1]
    return [
        {
            "id": f"fallback-war-{epoch}",
            "kind": "battle",
            "turn": epoch,
            "priority": "P1",
            "actor": _faction_enum(attacker),
            "target": _faction_enum(defender),
            "regionId": "unknown",
            "attackerLoss": 0.0,
            "defenderLoss": 0.0,
            "attackerRemainingTroops": 0.0,
            "defenderRemainingTroops": 0.0,
            "narration": base_text,
        }
    ]


def _synthetic_betrayals(
    key_events: list[str],
    epoch: int,
    faction_name: str,
) -> list[dict[str, Any]]:
    base_text = key_events[1] if len(key_events) > 1 else _default_key_event(faction_name, epoch)
    actor = _FACTION_IDS[1]
    defender = _FACTION_IDS[2]
    return [
        {
            "id": f"fallback-betrayal-{epoch}",
            "kind": "betrayal",
            "turn": epoch,
            "priority": "P1",
            "actor": _faction_enum(actor),
            "target": _faction_enum(defender),
            "narration": base_text,
        }
    ]


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

_FACTION_NAME_BY_ID = {
    "ironCrown": "铁冠帝国",
    "starlight": "星辉联邦",
    "emerald": "翡翠王庭",
    "ashen": "灰烬部族",
    "voidChurch": "虚空圣教",
    "aurora": "极光议会",
    "magma": "熔岩军团",
    "darkTide": "暗潮王国",
}


def _faction_enum(faction_id: str) -> FactionId:
    return FactionId(faction_id)


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


def _default_opening_narration_output(request: LLMRequest) -> dict[str, Any]:
    output = {
        "world_prologue": (
            "旧秩序的裂痕已无法掩饰。八大势力在大陆的边缘彼此试探，"
            "贸易路线上的商队开始携带武器，外交使节的马车里藏着密信。"
            "这是风暴前最后的平静——或者说，风暴已经开始，只是还没有人愿意承认。"
            "铁与火的时代即将降临，而每一个选择都将决定文明的走向。"
        ),
        "faction_briefs": [
            {"faction_id": "ironCrown", "situation": "铁冠帝国的军工厂日夜不停，边境驻军已达历史最高水平。帝国议会中主战派的声音越来越大。", "goal_hint": "寻找开战的正当理由"},
            {"faction_id": "starlight", "situation": "星辉联邦的情报网络捕捉到多方异动，联邦议会正在紧急评估威胁等级。", "goal_hint": "建立防御性同盟网络"},
            {"faction_id": "emerald", "situation": "翡翠王庭的商队遍布大陆，但贸易利润正在被边境摩擦侵蚀。商会急需稳定的外交环境。", "goal_hint": "通过贸易协定锁定盟友"},
            {"faction_id": "ashen", "situation": "灰烬部族的战士们在篝火旁磨砺武器，族长的荣誉誓言要求他们回应任何挑衅。", "goal_hint": "捍卫荣誉，回应威胁"},
            {"faction_id": "voidChurch", "situation": "虚空教廷的预言者声称看到了'大清洗'的征兆，信徒们在各国暗中扩张影响力。", "goal_hint": "扩大信仰版图"},
            {"faction_id": "aurora", "situation": "极光共和的学者们正在研究一项可能改变力量平衡的技术，但需要时间和和平环境。", "goal_hint": "争取研发时间"},
            {"faction_id": "magma", "situation": "熔岩议会控制着大陆最丰富的矿脉，各方势力的采购订单堆满了议事厅。", "goal_hint": "以资源换取安全保障"},
            {"faction_id": "darkTide", "situation": "暗潮商会的情报网已渗透到每个势力的核心圈层，手中握有足以颠覆格局的秘密。", "goal_hint": "贩卖情报，操纵局势"},
        ],
        "relationship_backstories": [
            {"from_faction": "ashen", "to_faction": "ironCrown", "backstory": "三代人前的'焦土之战'让灰烬部族失去了祖地，这笔血债从未被遗忘。铁冠帝国至今仍占据着那片土地。"},
            {"from_faction": "starlight", "to_faction": "aurora", "backstory": "两国共享'理性之光'的学术传统，联合研究院已运作百年。科技合作是双方关系的基石。"},
            {"from_faction": "emerald", "to_faction": "darkTide", "backstory": "翡翠王庭的贸易网络与暗潮商会的情报网络深度交织，双方在灰色地带有着默契的利益分配。"},
            {"from_faction": "voidChurch", "to_faction": "ashen", "backstory": "虚空教廷曾试图在灰烬部族传教，被视为对战士荣誉的侮辱而遭驱逐。双方至今互不信任。"},
        ],
        "opening_events": [
            {"headline": "边境商队遇袭", "narration": "一支翡翠王庭的商队在铁冠帝国边境遭到不明武装袭击，货物被劫。各方互相指责，真相扑朔迷离。", "involved_factions": ["emerald", "ironCrown"]},
            {"headline": "预言者公开宣言", "narration": "虚空教廷的大预言者在圣殿广场发表公开宣言，声称'旧世界的终结已经开始'，引发各国关注。", "involved_factions": ["voidChurch"]},
            {"headline": "矿脉争端升温", "narration": "熔岩议会宣布提高稀有矿石出口关税，多个依赖进口的势力表示强烈不满。", "involved_factions": ["magma", "ironCrown", "starlight"]},
        ],
        "faction_speeches": [
            {"faction_id": "ironCrown", "content": "帝国的意志如钢铁般坚定。我们不寻求战争，但绝不惧怕任何挑战。"},
            {"faction_id": "starlight", "content": "数据表明当前局势的不稳定系数已超过警戒线。我们呼吁各方回到谈判桌前。"},
            {"faction_id": "emerald", "content": "贸易是文明的血脉。我们愿与任何尊重契约精神的势力建立互利关系。"},
            {"faction_id": "ashen", "content": "灰烬部族的战士不会忘记过去的耻辱。我们的刀刃已经准备好了。"},
            {"faction_id": "voidChurch", "content": "命运的齿轮已经转动。信仰虚空者将在风暴中找到庇护。"},
            {"faction_id": "aurora", "content": "知识是最强大的武器。我们希望和平能持续足够长的时间。"},
            {"faction_id": "magma", "content": "矿脉是我们的，价格由我们定。想要资源？拿出诚意来谈。"},
            {"faction_id": "darkTide", "content": "每个人都有秘密。问题是，你愿意付出什么代价来保守它？"},
        ],
    }
    OpeningNarrationModelOutput.model_validate(output)
    return output
