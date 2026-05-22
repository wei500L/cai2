from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Generic, TypeVar

from app.repositories.base import AsyncRepository

T = TypeVar("T")


class MemoryRepository(Generic[T], AsyncRepository[T]):
    def __init__(self, items: Iterable[tuple[str, T]] | None = None) -> None:
        self._items: dict[str, T] = dict(items or [])
        self._lock = asyncio.Lock()

    async def get(self, item_id: str) -> T | None:
        async with self._lock:
            return self._items.get(item_id)

    async def upsert(self, item_id: str, item: T) -> None:
        async with self._lock:
            self._items[item_id] = item

    async def delete(self, item_id: str) -> None:
        async with self._lock:
            self._items.pop(item_id, None)

    async def list_all(self) -> list[T]:
        async with self._lock:
            return list(self._items.values())
