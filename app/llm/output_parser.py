# ruff: noqa: RUF001
from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.core.errors import ModelOutputError
from app.core.logging import get_logger
from app.llm.output_schema import NarrativeEvent, SettlementModelOutput

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(?P<body>.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)

logger = get_logger(__name__)


def strip_markdown_fences(text: str) -> str:
    match = _FENCE_RE.match(text)
    if match is None:
        return text.strip()
    return match.group("body").strip()


def coerce_to_dict(text: str) -> dict[str, Any]:
    stripped = strip_markdown_fences(text)
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as error:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise error
        parsed = json.loads(stripped[start : end + 1])

    if not isinstance(parsed, dict):
        raise TypeError("model output must be a JSON object")
    return parsed


def fallback_output() -> SettlementModelOutput:
    return SettlementModelOutput(
        narrative_events=[
            NarrativeEvent(
                kind="custom",
                actor=None,
                target=None,
                narration="裁决系统暂未响应，本回合按规则继续。",
            )
        ]
    )


class ModelOutputParser:
    def parse(self, llm_text: str) -> SettlementModelOutput:
        try:
            return self.parse_strict(llm_text)
        except ModelOutputError as error:
            logger.warning("Failed to parse settlement model output: %s", error)
            return fallback_output()

    def parse_strict(self, llm_text: str) -> SettlementModelOutput:
        try:
            stripped = strip_markdown_fences(llm_text)
            payload = coerce_to_dict(stripped)
            return SettlementModelOutput.model_validate(payload)
        except (json.JSONDecodeError, TypeError, ValueError, ValidationError) as error:
            raise ModelOutputError("invalid settlement model output") from error


def parse_settlement_output(raw_output: str) -> SettlementModelOutput:
    return ModelOutputParser().parse_strict(raw_output)
