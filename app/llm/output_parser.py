# ruff: noqa: RUF001
from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel
from pydantic import ValidationError

from app.core.errors import ModelOutputError
from app.core.logging import get_logger
from app.llm.output_schema import SettlementModelOutput

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(?P<body>.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)
ModelT = TypeVar("ModelT", bound=BaseModel)

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
        raise error

    if not isinstance(parsed, dict):
        raise TypeError("model output must be a JSON object")
    return parsed


def parse_model_output(text: str, model: type[ModelT]) -> ModelT:
    payload = coerce_to_dict(text)
    return model.model_validate_json(json.dumps(payload, ensure_ascii=False, default=str))


class ModelOutputParser:
    def parse(self, llm_text: str) -> SettlementModelOutput:
        try:
            return self.parse_strict(llm_text)
        except ModelOutputError as error:
            logger.error("Failed to parse settlement model output: %s", error)
            raise

    def parse_strict(self, llm_text: str) -> SettlementModelOutput:
        try:
            return parse_model_output(llm_text, SettlementModelOutput)
        except (json.JSONDecodeError, TypeError, ValueError, ValidationError) as error:
            raise ModelOutputError("invalid settlement model output") from error


def parse_settlement_output(raw_output: str) -> SettlementModelOutput:
    return ModelOutputParser().parse_strict(raw_output)
