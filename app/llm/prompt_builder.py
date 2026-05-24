"""本模块仅产出 prompt 文本，不调用模型。模型调用由 app.llm.client 负责。"""
# ruff: noqa: RUF001, RUF002, RUF003

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.domain.enums import FactionId
from app.domain.factions import FACTION_META, FactionMeta
from app.game.settlement_aggregator import SettlementInput

SYSTEM_PROMPT_TEMPLATE = """你是《外交风云》的裁决与叙事 AI。
你只在每回合结算阶段工作，不参与游戏过程中的实时对话。
你会收到本回合所有玩家行动、当前势力状态、关系矩阵、性格摘要和最近事件。
你的任务是给出八大势力的外交反应、局势判断和叙事结果。
你需要覆盖八大势力，不要只关注玩家直接提到的势力。
你需要考虑公开演讲、密谈、条约请求、军令和情报行动之间的相互影响。
你需要保持策略判断符合势力性格、历史关系和当前实力。
你需要识别合作、威胁、背叛、挑衅、示好、虚张声势和军事冒险。
你需要输出关系变化建议，但单次 relationship delta 的绝对值不得超过 30。
你需要输出士气变化建议，但单次 morale delta 的绝对值不得超过 0.2。
你需要输出文化影响，体现宣传、信仰、荣誉、贸易声誉和科技叙事的后果。
你需要输出 AI 发言，发言应符合对应势力的语气和利益。
对于每条 ai_speeches，请同时输出 internal_thought 字段（不超过 600 字符）。
internal_thought 代表该势力本回合的真实想法，可以与公开发言不一致。
它可以包含欺骗、记仇、计算等内心活动。
internal_thought 不会被其他势力看到。
当用户 prompt 含有 "## 八势力近期内心独白" 时，你必须考虑这些记忆做决策。
你需要输出条约结果，对每个条约请求给出接受、拒绝或反提案理由。
你需要输出战争建议，判断进攻合法性、战略含义和叙事后果。
战争建议仅作为后端规则引擎参考。
最终战斗、领土、资源、胜负和硬规则结算由后端 RuleResolver 处理。
你只是建议方，后端规则会最终裁决。
你不能假装已经修改了数据库或游戏状态。
你不能声称自己已经执行了军令或改变了地图。
你可以提出 map_change_suggestions，但这只是建议，不是最终事实。
你可以提出 stat_change_suggestions，但这只是建议，不是最终事实。
输出必须是严格 JSON，符合用户提供的 schema 形态。
不要输出 markdown 围栏。
不要输出 JSON 之外的解释性文字。
不要包含注释、尾随逗号或非 JSON 值。
所有 faction_id 必须使用输入中的枚举 ID 字符串。
所有 region_id 和 treaty_id 必须来自输入，除非字段允许为空。
理由字段要短而具体，便于后端和前端展示。
叙事字段要有世界观氛围，但不能覆盖规则裁决。
如果信息不足，给出保守建议并在 reason 中说明依据不足。
如果某类输出没有内容，返回空数组。
保持输出稳定、克制、可被程序解析。"""


OUTPUT_JSON_SCHEMA_HINT = """{
  "relationship_deltas": [
    {
      "from_faction": "faction_id",
      "to_faction": "faction_id",
      "delta": -30..30,
      "reason": "string"
    }
  ],
  "ai_speeches": [
    {
      "faction_id": "faction_id",
      "kind": "public|private|reaction|narration",
      "content": "string(1..400)",
      "target_faction": "faction_id|null",
      "internal_thought": "string|null(<=600, hidden)"
    }
  ],
  "treaty_decisions": [
    {
      "treaty_id": "treaty_action_id",
      "accepted": true,
      "reason": "string",
      "counter_proposal": "string|null"
    }
  ],
  "military_judgements": [
    {
      "region_id": "region_id",
      "attacker": "faction_id|null",
      "defender": "faction_id|null",
      "legitimacy": "just|neutral|unjust",
      "narrative": "string"
    }
  ],
  "culture_impacts": [
    {"faction_id": "faction_id", "delta": -20..20, "reason": "string"}
  ],
  "morale_impacts": [
    {"faction_id": "faction_id", "delta": -0.2..0.2, "reason": "string"}
  ],
  "narrative_events": [
    {
      "kind": "betrayal|alliance|declare_war|intel_leak|golden_age|civil_unrest|custom",
      "actor": "faction_id|null",
      "target": "faction_id|null",
      "narration": "string"
    }
  ],
  "map_change_suggestions": [
    {"region_id": "region_id", "new_owner": "faction_id|null", "reason": "string"}
  ],
  "stat_change_suggestions": [
    {
      "faction_id": "faction_id",
      "military_delta": -15..15,
      "economy_delta": -15..15,
      "diplomacy_delta": -15..15,
      "culture_delta": -15..15,
      "morale_delta": -0.1..0.1
    }
  ]
}"""

EPIC_NARRATION_SYSTEM_PROMPT = """你是纪元终章史官。
你只在纪元结束的裁决阶段工作。
你会收到本纪元的关键事件、势力排名变化、重大战争和背叛摘要。
你的任务是生成一段 200-600 字的中文纪元叙事。
叙事必须有史诗感，但不能夸张到失真。
你必须输出 tone 和 key_events，key_events 应是简短条目。
你不能输出 markdown 围栏。
你不能输出解释文字。
你不能输出超过 1000 字符的结果。
输出必须是严格 JSON，符合用户提供的 schema 形态。
如果信息不足，保持克制，优先描述能确认的事实。"""

SUMMARY_NARRATION_SYSTEM_PROMPT = """你是纪元终章简报生成器。
你只在纪元结束的裁决阶段工作。
你会收到本纪元的关键事件、势力排名变化、重大战争和背叛摘要。
你的任务是生成结构化 JSON 简报，headline 要简短有力，highlights 要保持简洁。
不要输出长篇叙事字段。
不要输出 markdown 围栏。
不要输出解释文字。
不要输出超过 1000 字符的结果。
输出必须是严格 JSON，符合用户提供的 schema 形态。"""

EPIC_NARRATION_JSON_SCHEMA_HINT = """{
  "narrative": "string(200..600, 中文)",
  "tone": "string(1..32)",
  "key_events": ["string"]
}"""

SUMMARY_NARRATION_JSON_SCHEMA_HINT = """{
  "headline": "string(1..64)",
  "rankings": [
    {
      "id": "faction_id",
      "name": "string",
      "totalPower": 0.0,
      "previousRank": 1,
      "currentRank": 1,
      "rankDelta": 0,
      "previousPower": 0.0
    }
  ],
  "highlights": {
    "majorEvents": [
      {
        "id": "string",
        "kind": "string",
        "turn": 1,
        "priority": "P0|P1|P2",
        "actor": "faction_id|null",
        "target": "faction_id|null",
        "narration": "string"
      }
    ],
    "wars": [
      {
        "id": "string",
        "kind": "battle",
        "turn": 1,
        "priority": "P0|P1|P2",
        "actor": "faction_id",
        "target": "faction_id",
        "regionId": "string",
        "attackerLoss": 0.0,
        "defenderLoss": 0.0,
        "attackerRemainingTroops": 0.0,
        "defenderRemainingTroops": 0.0,
        "narration": "string"
      }
    ],
    "betrayals": [
      {
        "id": "string",
        "kind": "betrayal",
        "turn": 1,
        "priority": "P0|P1|P2",
        "actor": "faction_id",
        "target": "faction_id",
        "narration": "string"
      }
    ]
  }
}"""

OPENING_NARRATION_SYSTEM_PROMPT = """你是《外交风云》的开局叙事生成器。
你只在游戏开局时工作一次，为八大势力的世界生成背景叙事和开场白。
你会收到八大势力的基本信息（文明特征、优势、性格）和初始关系设定。
你的任务是：
1. 生成一段有氛围感的世界开场白（100-300字），描述这个时代的总体格局和风暴前夜的气氛。
2. 为每个势力生成当前处境简报（50-100字），暗示其短期目标。
3. 为有明确预设关系的势力对解释背景故事（为什么敌对/亲近）。
4. 生成2-3条开局世界事件（新闻），让玩家有信息可以反应。
5. 为每个AI势力生成一句开场公开发言，符合该势力的语气风格。
发言风格参考：
- commanding_imperial: 威严、命令式、帝王口吻
- analytical_diplomatic: 理性、数据驱动、外交辞令
- charming_mercantile: 圆滑、利益导向、商人口吻
- passionate_warrior: 热血、直接、战士口吻
- mystical_prophetic: 神秘、预言式、宗教口吻
- academic_neutral: 学术、中立、温和
- gruff_pragmatic: 粗犷、务实、少废话
- smooth_conspiratorial: 老练、暗示、情报口吻
输出必须是严格JSON，符合用户提供的schema形态。
不要输出markdown围栏。不要输出JSON之外的解释性文字。
所有faction_id必须使用枚举ID字符串（ironCrown, starlight, emerald, ashen, voidChurch, aurora, magma, darkTide）。
保持叙事有世界观氛围，但不要过于冗长。"""

OPENING_NARRATION_JSON_SCHEMA_HINT = """{
  "world_prologue": "string(100..300字，时代背景叙事)",
  "faction_briefs": [
    {"faction_id": "faction_id", "situation": "string(50..100字)", "goal_hint": "string(20..60字)"}
  ],
  "relationship_backstories": [
    {"from_faction": "faction_id", "to_faction": "faction_id", "backstory": "string(30..150字)"}
  ],
  "opening_events": [
    {"headline": "string(5..30字)", "narration": "string(30..150字)", "involved_factions": ["faction_id"]}
  ],
  "faction_speeches": [
    {"faction_id": "faction_id", "content": "string(20..150字，符合该势力speech_style)"}
  ]
}"""


class SettlementPrompt(BaseModel):
    model_config = ConfigDict(strict=True)

    system: str
    user: str
    json_schema_hint: str
    temperature: float = 0.6
    max_tokens: int = 4000


class NarrationPrompt(BaseModel):
    model_config = ConfigDict(strict=True)

    system: str
    user: str
    json_schema_hint: str
    temperature: float = 0.45
    max_tokens: int = 800


class OpeningNarrationPrompt(BaseModel):
    model_config = ConfigDict(strict=True)

    system: str
    user: str
    json_schema_hint: str
    temperature: float = 0.75
    max_tokens: int = 3000


class PromptBuilder:
    def build_settlement_prompt(self, input: SettlementInput) -> SettlementPrompt:
        recent_events = [
            f"- {truncate(event.narration, max_chars=220)}" for event in input.recent_events[:20]
        ]

        user = "\n\n".join(
            [
                "## 当前回合（epoch / turn）\n"
                f"epoch={input.epoch}\n"
                f"turn={input.turn}\n"
                f"room_id={input.room_id}\n"
                f"generated_at_ms={input.generated_at_ms}",
                "## 八势力状态（faction_stats_summary_text）\n"
                f"{input.faction_stats_summary_text}",
                "## 关系矩阵（relationship_summary_text）\n"
                f"{input.relationship_summary_text}",
                "## 八势力性格简要（faction_personality_summary 序列化文本）\n"
                f"{format_personality_summary(input.faction_personality_summary)}",
                "## 八势力近期内心独白（仅给模型，不对外）\n"
                f"{format_recent_diaries(input.faction_recent_diaries)}",
                "## 本回合公开演讲\n"
                f"{_join_lines(format_action_lines(input.public_speeches, '公开演讲'))}",
                "## 本回合密谈\n"
                f"{_join_lines(format_action_lines(input.private_messages, '密谈'))}",
                "## 本回合条约请求\n"
                f"{_join_lines(format_action_lines(input.treaty_requests, '条约请求'))}",
                "## 本回合军令\n"
                f"{_join_lines(format_action_lines(input.military_orders, '军令'))}",
                "## 本回合情报\n"
                f"{_join_lines(format_action_lines(input.intel_actions, '情报'))}",
                "## 最近事件\n"
                f"{_join_lines(recent_events)}",
                "## 输出格式\n"
                f"{OUTPUT_JSON_SCHEMA_HINT}",
            ]
        )

        # 未来可扩展安全过滤；MVP 阶段仅集中构造结算 prompt。
        return SettlementPrompt(
            system=SYSTEM_PROMPT_TEMPLATE,
            user=user,
            json_schema_hint=OUTPUT_JSON_SCHEMA_HINT,
        )

    def build_epic_narration_prompt(self, epoch_state: Any) -> NarrationPrompt:
        key_events = _format_narration_lines(_value_of(epoch_state, "key_events", []))
        rankings = _format_epoch_rankings(_value_of(epoch_state, "rankings", []))
        major_events = _format_narration_lines(
            _value_of(_value_of(epoch_state, "highlights", {}), "majorEvents", []),
        )
        wars = _format_narration_lines(
            _value_of(_value_of(epoch_state, "highlights", {}), "wars", []),
        )
        betrayals = _format_narration_lines(
            _value_of(_value_of(epoch_state, "highlights", {}), "betrayals", []),
        )

        user = "\n\n".join(
            [
                "## 当前纪元信息\n"
                f"room_id={_value_of(epoch_state, 'room_id', 'unknown')}\n"
                f"epoch={_value_of(epoch_state, 'epoch', '?')}\n"
                f"turn={_value_of(epoch_state, 'turn', '?')}\n"
                f"generated_at_ms={_value_of(epoch_state, 'generated_at_ms', '?')}\n"
                f"tone_hint={_value_of(epoch_state, 'tone', '史诗')}",
                "## 关键事件\n"
                f"{_join_lines(key_events)}",
                "## 势力排名变化\n"
                f"{_join_lines(rankings)}",
                "## 重大战争\n"
                f"{_join_lines(wars)}",
                "## 重大背叛\n"
                f"{_join_lines(betrayals)}",
                "## 重大事件摘要\n"
                f"{_join_lines(major_events)}",
                "## 输出格式\n"
                f"{EPIC_NARRATION_JSON_SCHEMA_HINT}",
            ]
        )

        return NarrationPrompt(
            system=EPIC_NARRATION_SYSTEM_PROMPT,
            user=user,
            json_schema_hint=EPIC_NARRATION_JSON_SCHEMA_HINT,
            temperature=0.7,
            max_tokens=720,
        )

    def build_summary_narration_prompt(self, epoch_state: Any) -> NarrationPrompt:
        key_events = _format_narration_lines(_value_of(epoch_state, "key_events", []))
        rankings = _format_epoch_rankings(_value_of(epoch_state, "rankings", []))
        highlights = _value_of(epoch_state, "highlights", {})
        major_events = _format_narration_lines(_value_of(highlights, "majorEvents", []))
        wars = _format_narration_lines(_value_of(highlights, "wars", []))
        betrayals = _format_narration_lines(_value_of(highlights, "betrayals", []))

        user = "\n\n".join(
            [
                "## 当前纪元信息\n"
                f"room_id={_value_of(epoch_state, 'room_id', 'unknown')}\n"
                f"epoch={_value_of(epoch_state, 'epoch', '?')}\n"
                f"turn={_value_of(epoch_state, 'turn', '?')}\n"
                f"generated_at_ms={_value_of(epoch_state, 'generated_at_ms', '?')}",
                "## 关键事件\n"
                f"{_join_lines(key_events)}",
                "## 排名快照\n"
                f"{_join_lines(rankings)}",
                "## 重大事件\n"
                f"{_join_lines(major_events)}",
                "## 战争摘要\n"
                f"{_join_lines(wars)}",
                "## 背叛摘要\n"
                f"{_join_lines(betrayals)}",
                "## 输出要求\n"
                "仅输出严格 JSON，不要输出长篇叙事字段，不要添加解释文本。",
                "## 输出格式\n"
                f"{SUMMARY_NARRATION_JSON_SCHEMA_HINT}",
            ]
        )

        return NarrationPrompt(
            system=SUMMARY_NARRATION_SYSTEM_PROMPT,
            user=user,
            json_schema_hint=SUMMARY_NARRATION_JSON_SCHEMA_HINT,
            temperature=0.35,
            max_tokens=540,
        )

    def build_opening_narration_prompt(
        self,
        *,
        faction_ids: list[FactionId],
        relationships_summary: str,
        ai_faction_ids: list[FactionId],
    ) -> OpeningNarrationPrompt:
        faction_lines: list[str] = []
        for fid in faction_ids:
            meta = FACTION_META[fid]
            faction_lines.append(
                f"- {fid.value}({meta.name}): "
                f"文明={meta.civilization}; 原型={meta.archetype}; "
                f"优势={meta.advantage}; 语气={meta.speech_style}"
            )

        ai_ids_str = ", ".join(fid.value for fid in ai_faction_ids)

        user = "\n\n".join(
            [
                "## 八大势力\n" + "\n".join(faction_lines),
                "## 初始关系设定\n" + relationships_summary,
                f"## AI 控制的势力（需要生成开场发言）\n{ai_ids_str}",
                "## 输出格式\n" + OPENING_NARRATION_JSON_SCHEMA_HINT,
            ]
        )

        return OpeningNarrationPrompt(
            system=OPENING_NARRATION_SYSTEM_PROMPT,
            user=user,
            json_schema_hint=OPENING_NARRATION_JSON_SCHEMA_HINT,
        )


def truncate(text: str, *, max_chars: int) -> str:
    if max_chars < 0:
        raise ValueError("max_chars must be non-negative")
    if len(text) <= max_chars:
        return text
    if max_chars <= 3:
        return text[:max_chars]
    return f"{text[: max_chars - 3]}..."


def format_action_lines(actions: Iterable[Any], prefix_label: str) -> list[str]:
    action_list = list(actions)
    if not action_list:
        return ["- （无）"]

    lines: list[str] = []
    for index, action in enumerate(action_list, start=1):
        actor = _stringify(getattr(action, "actor_faction", "unknown"))
        mode = getattr(action, "mode", "")
        if mode == "speech":
            lines.append(
                f"- {prefix_label} {index}: actor={actor}; "
                f"targets={_format_faction_sequence(getattr(action, 'targets', []))}; "
                f"content={truncate(getattr(action, 'content', ''), max_chars=220)}"
            )
        elif mode == "private":
            lines.append(
                f"- {prefix_label} {index}: actor={actor} -> "
                f"target={_stringify(getattr(action, 'target_faction', 'unknown'))}; "
                f"content={truncate(getattr(action, 'content', ''), max_chars=260)}"
            )
        elif mode == "treaty":
            target_factions = _format_faction_sequence(
                getattr(action, "target_factions", [])
            )
            lines.append(
                f"- {prefix_label} {index}: id={_stringify(getattr(action, 'id', 'unknown'))}; "
                f"actor={actor}; kind={_stringify(getattr(action, 'treaty_kind', 'unknown'))}; "
                f"target_factions={target_factions}; "
                f"proposal_text={truncate(getattr(action, 'proposal_text', ''), max_chars=260)}"
            )
        elif mode == "military":
            troops = getattr(action, "troops", None)
            troops_text = "unknown" if troops is None else str(troops)
            lines.append(
                f"- {prefix_label} {index}: actor={actor}; "
                f"{_stringify(getattr(action, 'source_region', 'unknown'))} -> "
                f"{_stringify(getattr(action, 'target_region', 'unknown'))}; "
                f"movement={_stringify(getattr(action, 'movement', 'unknown'))}; "
                f"troops={troops_text}; "
                f"orders_text={truncate(getattr(action, 'orders_text', ''), max_chars=260)}"
            )
        elif mode == "intel":
            lines.append(
                f"- {prefix_label} {index}: actor={actor}; "
                f"target={_stringify(getattr(action, 'target_faction', 'unknown'))}; "
                f"kind={_stringify(getattr(action, 'intel_kind', 'unknown'))}; "
                f"brief={truncate(getattr(action, 'brief', ''), max_chars=220)}"
            )
        else:
            lines.append(f"- {prefix_label} {index}: actor={actor}; mode={_stringify(mode)}")

    return lines


def format_personality_summary(personality_dict: Mapping[Any, Mapping[str, Any]]) -> str:
    if not personality_dict:
        return "No faction personality summary recorded."

    lines: list[str] = []
    for faction_id in sorted(personality_dict, key=lambda item: _stringify(item)):
        summary = personality_dict[faction_id]
        values = ", ".join(
            f"{key}={_format_value(summary[key])}" for key in sorted(summary, key=str)
        )
        lines.append(f"- {_stringify(faction_id)}: {values}")
    return "\n".join(lines)


def format_recent_diaries(diaries_by_faction: Mapping[Any, Sequence[Any]]) -> str:
    if not diaries_by_faction:
        return "- （无历史内心独白）"

    lines: list[str] = []
    for faction_id in sorted(diaries_by_faction, key=lambda item: _stringify(item)):
        entries = list(diaries_by_faction[faction_id])
        lines.append(f"- {_stringify(faction_id)}:")
        if not entries:
            lines.append("  - （无）")
            continue

        for entry in entries:
            epoch = _stringify(getattr(entry, "epoch", "?"))
            turn = _stringify(getattr(entry, "turn", "?"))
            emotion = _stringify(getattr(entry, "emotion", "（未知）"))
            thought = truncate(
                _stringify(getattr(entry, "internal_thought", "")),
                max_chars=220,
            )
            lines.append(f"  - E{epoch}/T{turn}; emotion={emotion}; thought={thought}")

    return "\n".join(lines)


def _join_lines(lines: Sequence[str]) -> str:
    return "\n".join(lines) if lines else "- （无）"


def _format_faction_sequence(values: Iterable[Any]) -> str:
    items = [_stringify(value) for value in values]
    return "[" + ", ".join(items) + "]"


def _format_value(value: Any) -> str:
    if isinstance(value, Mapping):
        parts = ", ".join(f"{key}: {_format_value(value[key])}" for key in sorted(value, key=str))
        return "{" + parts + "}"
    if isinstance(value, str):
        return value
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        return "[" + ", ".join(_format_value(item) for item in value) + "]"
    return _stringify(value)


def _stringify(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _value_of(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(key, default)
    return getattr(value, key, default)


def _format_epoch_rankings(rankings: Sequence[Any]) -> list[str]:
    if not rankings:
        return ["- （无排名变化）"]

    lines: list[str] = []
    for index, ranking in enumerate(rankings, start=1):
        faction_name = _stringify(_value_of(ranking, "name", _value_of(ranking, "id", "unknown")))
        faction_id = _stringify(_value_of(ranking, "id", "unknown"))
        current_rank = _stringify(
            _value_of(ranking, "currentRank", _value_of(ranking, "rank", "?"))
        )
        previous_rank = _stringify(_value_of(ranking, "previousRank", "?"))
        rank_delta = _stringify(_value_of(ranking, "rankDelta", _value_of(ranking, "delta", 0)))
        total_power = _stringify(_value_of(ranking, "totalPower", 0.0))
        previous_power = _stringify(_value_of(ranking, "previousPower", 0.0))
        lines.append(
            f"- {index}. {faction_name}({faction_id}) rank {previous_rank} -> {current_rank}; "
            f"delta={rank_delta}; power {previous_power} -> {total_power}"
        )
    return lines


def _format_narration_lines(items: Sequence[Any]) -> list[str]:
    if not items:
        return ["- （无）"]

    lines: list[str] = []
    for index, item in enumerate(items, start=1):
        item_id = _stringify(_value_of(item, "id", f"item-{index}"))
        kind = _stringify(_value_of(item, "kind", "unknown"))
        turn = _stringify(_value_of(item, "turn", "?"))
        priority = _stringify(_value_of(item, "priority", "P2"))
        actor = _stringify(_value_of(item, "actor", ""))
        target = _stringify(_value_of(item, "target", ""))
        narration = truncate(_stringify(_value_of(item, "narration", "")), max_chars=180)
        parts = [
            f"- {index}. id={item_id}",
            f"kind={kind}",
            f"T{turn}",
            f"priority={priority}",
        ]
        if actor and actor != "None":
            parts.append(f"actor={actor}")
        if target and target != "None":
            parts.append(f"target={target}")
        parts.append(f"text={narration}")
        lines.append("; ".join(parts))

    return lines
