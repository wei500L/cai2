"""本模块仅产出 prompt 文本，不调用模型。模型调用由 app.llm.client 负责，且只在结算阶段触发。"""
# ruff: noqa: RUF001, RUF002, RUF003

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict

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
      "target_faction": "faction_id|null"
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


class SettlementPrompt(BaseModel):
    model_config = ConfigDict(strict=True)

    system: str
    user: str
    json_schema_hint: str
    temperature: float = 0.6
    max_tokens: int = 4000


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
