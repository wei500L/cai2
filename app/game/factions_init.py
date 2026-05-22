from __future__ import annotations

from random import Random

from app.domain.enums import FactionId, FactionStatusKind
from app.domain.models import FactionState

JITTER_RATIO = 0.05


def build_initial_faction_state(faction_id: FactionId, rng: Random) -> FactionState:
    military = _jittered(_base_military(faction_id), rng)
    economy = _jittered(100.0, rng)
    diplomacy = _jittered(50.0, rng)
    culture = _jittered(30.0, rng)
    morale = _jittered_morale(_base_morale(faction_id), rng)
    total_power = _total_power(
        military=military,
        economy=economy,
        diplomacy=diplomacy,
        culture=culture,
    )

    return FactionState(
        id=faction_id,
        military=military,
        economy=economy,
        diplomacy=diplomacy,
        culture=culture,
        morale=morale,
        total_power=total_power,
        status=FactionStatusKind.stable,
        eliminated_at_turn=None,
    )


def _base_military(faction_id: FactionId) -> float:
    if faction_id == FactionId.ironCrown:
        return 120.0
    return 100.0


def _base_morale(faction_id: FactionId) -> float:
    if faction_id == FactionId.ashen:
        return 1.3
    return 1.0


def _jittered(value: float, rng: Random) -> float:
    return round(value * rng.uniform(1.0 - JITTER_RATIO, 1.0 + JITTER_RATIO), 4)


def _jittered_morale(value: float, rng: Random) -> float:
    return round(rng.uniform(value - 0.05, value + 0.05), 4)


def _total_power(*, military: float, economy: float, diplomacy: float, culture: float) -> float:
    return round(military * 0.35 + economy * 0.25 + diplomacy * 0.25 + culture * 0.15, 4)
