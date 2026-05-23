from __future__ import annotations

import pytest

from app.domain.enums import FactionId
from app.domain.models import DiaryEntry
from app.repositories.memory import MemoryDiaryRepository


def _entry(index: int, *, faction_id: FactionId = FactionId.ironCrown) -> DiaryEntry:
    return DiaryEntry(
        faction_id=faction_id,
        epoch=1,
        turn=index,
        internal_thought=f"thought-{index}",
        emotion="calm",
        triggers=[f"event-{index}"],
        created_at_ms=1_000 + index,
    )


@pytest.mark.asyncio
async def test_diary_repository_append_list_recent_and_deep_copy() -> None:
    repo = MemoryDiaryRepository()

    await repo.append(_entry(1), room_id="room-1")
    await repo.append(_entry(2), room_id="room-1")
    await repo.append(_entry(3), room_id="room-1")
    await repo.append(_entry(4, faction_id=FactionId.starlight), room_id="room-1")

    recent = await repo.list_recent("room-1", FactionId.ironCrown, max_entries=2)
    assert [entry.turn for entry in recent] == [2, 3]

    recent[0].internal_thought = "mutated"
    again = await repo.list_recent("room-1", FactionId.ironCrown, max_entries=3)
    assert [entry.internal_thought for entry in again] == ["thought-1", "thought-2", "thought-3"]

    all_by_room = await repo.list_all_by_room("room-1")
    assert set(all_by_room) == {FactionId.ironCrown, FactionId.starlight}
    assert [entry.turn for entry in all_by_room[FactionId.starlight]] == [4]
