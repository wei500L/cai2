from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(slots=True, frozen=True)
class WorldLighting:
    sun_lat: float
    sun_lng: float
    day_color: str
    night_color: str
    phase_label: str

    def to_payload(self) -> dict[str, float | str]:
        return asdict(self)


@dataclass(slots=True, frozen=True)
class WorldLightingPolicy:
    sun_lat_base: float = 18.0
    sun_lat_season_step: float = 3.5
    sun_lng_base: float = -120.0
    sun_lng_turn_step: float = 18.0
    day_color: str = "#d9c37c"
    night_color: str = "#0e1830"

    def next(self, turn: int) -> WorldLighting:
        turn_index = max(turn - 1, 0)
        day_cycle = ("dawn", "day", "dusk", "night")[turn_index % 4]
        season = ("spring", "summer", "autumn", "winter")[(turn_index // 12) % 4]
        season_offset = ((turn_index // 12) % 4) - 1.5
        return WorldLighting(
            sun_lat=self.sun_lat_base + season_offset * self.sun_lat_season_step,
            sun_lng=self.sun_lng_base + turn_index * self.sun_lng_turn_step,
            day_color=self.day_color,
            night_color=self.night_color,
            phase_label=f"{season}_{day_cycle}",
        )
