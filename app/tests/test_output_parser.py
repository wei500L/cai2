from __future__ import annotations

import json
from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import ModelOutputError
from app.domain.enums import FactionId
from app.llm.output_parser import (
    ModelOutputParser,
    coerce_to_dict,
    fallback_output,
    strip_markdown_fences,
)
from app.llm.output_schema import SettlementModelOutput


def test_standard_json_parses_successfully() -> None:
    result = ModelOutputParser().parse(_json_text(_valid_payload()))

    assert result.relationship_deltas[0].from_faction == FactionId.ironCrown
    assert result.relationship_deltas[0].delta == 12.0
    assert result.ai_speeches[0].content == "We will keep the border stable."
    assert result.military_judgements[0].legitimacy == "neutral"


def test_json_fence_parses_successfully() -> None:
    text = f"```json\n{_json_text(_valid_payload())}\n```"

    result = ModelOutputParser().parse(text)

    assert result.narrative_events[0].narration == "A quiet shift in power is noted."


def test_plain_fence_parses_successfully() -> None:
    text = f"```\n{_json_text(_valid_payload())}\n```"

    result = ModelOutputParser().parse(text)

    assert result.treaty_decisions[0].accepted is True


def test_json_with_surrounding_text_parses_successfully() -> None:
    text = f"Here's the result:\n{_json_text(_valid_payload())}\nThanks"

    result = ModelOutputParser().parse(text)

    assert result.culture_impacts[0].delta == 3.0


def test_invalid_json_parse_returns_fallback_and_strict_raises() -> None:
    parser = ModelOutputParser()
    broken = '{"relationship_deltas": ['

    result = parser.parse(broken)

    assert result.relationship_deltas == []
    assert result.narrative_events[0].narration
    with pytest.raises(ModelOutputError):
        parser.parse_strict(broken)


def test_missing_whole_field_uses_default_empty_list() -> None:
    payload = _valid_payload()
    payload.pop("relationship_deltas")

    result = ModelOutputParser().parse(_json_text(payload))

    assert result.relationship_deltas == []
    assert result.ai_speeches


def test_out_of_range_relationship_delta_rejects_output() -> None:
    parser = ModelOutputParser()
    payload = _valid_payload()
    payload["relationship_deltas"][0]["delta"] = 999

    result = parser.parse(_json_text(payload))

    assert result.relationship_deltas == []
    assert result.narrative_events[0].kind == "custom"
    with pytest.raises(ModelOutputError) as exc_info:
        parser.parse_strict(_json_text(payload))
    assert isinstance(exc_info.value.__cause__, ValidationError)


def test_extra_fields_are_ignored() -> None:
    payload = _valid_payload()
    payload["unexpected_root"] = "ignored"
    payload["relationship_deltas"][0]["unexpected_nested"] = "ignored"

    result = ModelOutputParser().parse(_json_text(payload))

    assert isinstance(result, SettlementModelOutput)
    assert not hasattr(result, "unexpected_root")
    assert not hasattr(result.relationship_deltas[0], "unexpected_nested")


def test_ai_speech_content_too_long_returns_fallback() -> None:
    payload = _valid_payload()
    payload["ai_speeches"][0]["content"] = "x" * 401

    result = ModelOutputParser().parse(_json_text(payload))

    assert result.ai_speeches == []
    assert result.narrative_events[0].narration == "裁决系统暂未响应，本回合按规则继续。"


def test_fallback_output_has_non_empty_narration() -> None:
    result = fallback_output()

    assert result.relationship_deltas == []
    assert result.narrative_events[0].narration


def test_strip_markdown_fences_handles_json_and_plain_fences() -> None:
    assert strip_markdown_fences("```json\n{}\n```") == "{}"
    assert strip_markdown_fences("```\n{}\n```") == "{}"


def test_coerce_to_dict_extracts_json_object_substring() -> None:
    assert coerce_to_dict('prefix {"relationship_deltas": []} suffix') == {
        "relationship_deltas": []
    }


def _valid_payload() -> dict[str, Any]:
    return {
        "relationship_deltas": [
            {
                "from_faction": "ironCrown",
                "to_faction": "starlight",
                "delta": 12.0,
                "reason": "A measured concession improved trust.",
            }
        ],
        "ai_speeches": [
            {
                "faction_id": "starlight",
                "kind": "public",
                "content": "We will keep the border stable.",
                "target_faction": "ironCrown",
            }
        ],
        "treaty_decisions": [
            {
                "treaty_id": "treaty-1",
                "accepted": True,
                "reason": "The terms reduce near-term risk.",
                "counter_proposal": None,
            }
        ],
        "military_judgements": [
            {
                "region_id": "region-1",
                "attacker": "ironCrown",
                "defender": "starlight",
                "legitimacy": "neutral",
                "narrative": "The move is tense but not clearly unlawful.",
            }
        ],
        "culture_impacts": [
            {
                "faction_id": "ironCrown",
                "delta": 3.0,
                "reason": "Public discipline strengthened prestige.",
            }
        ],
        "morale_impacts": [
            {
                "faction_id": "ironCrown",
                "delta": 0.05,
                "reason": "The faction sees the turn as controlled.",
            }
        ],
        "narrative_events": [
            {
                "kind": "custom",
                "actor": "ironCrown",
                "target": "starlight",
                "narration": "A quiet shift in power is noted.",
            }
        ],
        "map_change_suggestions": [
            {
                "region_id": "region-1",
                "new_owner": None,
                "reason": "No hard territorial transfer is justified.",
            }
        ],
        "stat_change_suggestions": [
            {
                "faction_id": "ironCrown",
                "military_delta": 1.0,
                "economy_delta": 0.0,
                "diplomacy_delta": 2.0,
                "culture_delta": 1.0,
                "morale_delta": 0.05,
            }
        ],
    }


def _json_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)
