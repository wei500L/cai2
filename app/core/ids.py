from collections import defaultdict
from uuid import uuid4


def _short_uuid(prefix: str, width: int = 12) -> str:
    return f"{prefix}_{uuid4().hex[:width]}"


def new_message_id() -> str:
    return _short_uuid("msg")


def new_room_id() -> str:
    return _short_uuid("room")


def new_player_id() -> str:
    return _short_uuid("p")


class SequenceGen:
    def __init__(self) -> None:
        self._counters: dict[str, int] = defaultdict(int)

    def next(self, room_id: str) -> int:
        self._counters[room_id] += 1
        return self._counters[room_id]

    def current(self, room_id: str) -> int:
        return self._counters[room_id]

    def reset(self, room_id: str) -> None:
        self._counters.pop(room_id, None)

