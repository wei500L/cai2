"""未来用于 Redis 跨进程房间事件广播与热数据缓存。"""

from __future__ import annotations

from typing import Any


class RedisPubSub:
    async def connect(self) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def publish(self, channel: str, msg: dict[str, Any]) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def subscribe(self, channel: str) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def unsubscribe(self, channel: str) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def close(self) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")


class RedisCache:
    async def set(self, key: str, value: Any) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def get(self, key: str) -> Any | None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def delete(self, key: str) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")

    async def expire(self, key: str, ttl_seconds: int) -> None:
        raise NotImplementedError("redis adapter pending; see docs/PERSISTENCE_PLAN.md")
