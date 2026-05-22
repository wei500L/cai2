from __future__ import annotations

from typing import Protocol, TypeVar

T = TypeVar("T")


class AsyncRepository(Protocol[T]):
    async def get(self, item_id: str) -> T | None:
        ...

    async def upsert(self, item_id: str, item: T) -> None:
        ...

    async def delete(self, item_id: str) -> None:
        ...

    async def list_all(self) -> list[T]:
        ...
