from __future__ import annotations

from os import getenv
from typing import Any

from app.llm.claude_client import ClaudeCompatibleClient
from app.llm.client import LLMClient
from app.llm.mock_client import MockLLMClient
from app.llm.openai_client import OpenAICompatibleClient


def make_llm_client(provider: str, *, settings: Any = None) -> LLMClient:
    timeout_s = float(getenv("LLM_TIMEOUT_S", "8"))
    if provider == "mock":
        return MockLLMClient()
    if provider == "openai":
        return OpenAICompatibleClient(
            api_key=_read_setting(settings, "openai_api_key", "OPENAI_API_KEY", ""),
            base_url=_read_setting(
                settings,
                "openai_base_url",
                "OPENAI_BASE_URL",
                "https://api.openai.com/v1",
            ),
            model=_read_setting(settings, "openai_model", "OPENAI_MODEL", "gpt-4.1-mini"),
            timeout_s=timeout_s,
        )
    if provider == "claude":
        return ClaudeCompatibleClient(
            api_key=_read_setting(settings, "claude_api_key", "CLAUDE_API_KEY", ""),
            base_url=_read_setting(
                settings,
                "claude_base_url",
                "CLAUDE_BASE_URL",
                "https://api.anthropic.com/v1",
            ),
            model=_read_setting(
                settings,
                "claude_model",
                "CLAUDE_MODEL",
                "claude-3-5-sonnet-20241022",
            ),
            timeout_s=timeout_s,
        )
    raise ValueError(f"unknown llm provider: {provider}")


def _read_setting(settings: Any, attr_name: str, env_name: str, default: str) -> str:
    if settings is not None and hasattr(settings, attr_name):
        value = getattr(settings, attr_name)
        if isinstance(value, str) and value:
            return value
    value = getenv(env_name, default).strip()
    return value or default
