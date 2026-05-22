"""未来用于跨进程房间事件广播。"""

from __future__ import annotations

from typing import Any

_PENDING = "redis adapter pending"


class RedisPubSub:
    async def publish(self, channel: str, msg: dict[str, Any]) -> None:
        raise NotImplementedError(_PENDING)

    async def subscribe(self, channel: str) -> None:
        raise NotImplementedError(_PENDING)

    async def unsubscribe(self, channel: str) -> None:
        raise NotImplementedError(_PENDING)
