from __future__ import annotations

import asyncio

from app.llm.client import LLMClient, LLMRequest, LLMResponse


async def call_with_retry(
    client: LLMClient,
    request: LLMRequest,
    *,
    max_retries: int = 1,
    base_delay_ms: int = 200,
) -> LLMResponse:
    retries = max(0, max_retries)
    for attempt in range(retries + 1):
        try:
            return await client.call_settlement_model(request)
        except Exception:
            if attempt >= retries:
                raise
            delay_s = (base_delay_ms * (2**attempt)) / 1000
            if delay_s > 0:
                await asyncio.sleep(delay_s)

    raise RuntimeError("unreachable retry state")
