from __future__ import annotations

from dataclasses import dataclass
from time import time_ns
from typing import Protocol


class Clock(Protocol):
    def now_ms(self) -> int:
        """Return the current time in milliseconds."""


class SystemClock:
    def now_ms(self) -> int:
        return time_ns() // 1_000_000


@dataclass(slots=True)
class FrozenClock:
    value_ms: int = 0

    def now_ms(self) -> int:
        return self.value_ms

    def advance_ms(self, delta_ms: int) -> int:
        self.value_ms += delta_ms
        return self.value_ms

    def set_ms(self, value_ms: int) -> None:
        self.value_ms = value_ms

