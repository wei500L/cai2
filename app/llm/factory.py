from __future__ import annotations

from typing import Any

from app.llm.client import LLMClient
from app.llm.mock_client import MockLLMClient


def make_llm_client(provider: str, *, settings: Any = None) -> LLMClient:
    if provider == "mock":
        return MockLLMClient()
    if provider in {"openai", "claude"}:
        # 未来从 settings 读取 api_key / base_url / model 等配置并接入真实适配器。
        _ = settings
        raise NotImplementedError("provider not wired yet; default to mock in MVP")
    raise ValueError(f"unknown llm provider: {provider}")
