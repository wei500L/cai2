from __future__ import annotations

from random import Random

from app.core.clock import Clock
from app.domain.enums import GamePhase
from app.domain.factions import all_faction_ids
from app.domain.models import EpochTurn, GameRoom, InitialGameState
from app.game.factions_init import build_initial_faction_state
from app.game.map_init import build_initial_regions
from app.game.relationships_init import build_initial_relationships

INITIAL_PHASE_DURATION_MS = 15_000


def initialize_game_state(room: GameRoom, *, clock: Clock) -> InitialGameState:
    rng = Random(room.seed)
    faction_ids = list(all_faction_ids())

    return InitialGameState(
        factions=[build_initial_faction_state(faction_id, rng) for faction_id in faction_ids],
        regions=build_initial_regions(faction_ids, rng),
        relationships=build_initial_relationships(rng),
        treaties=[],
        current_turn=EpochTurn(
            epoch=1,
            turn=1,
            phase=GamePhase.observe,
            arbitrate_phase=None,
            phase_started_at_ms=clock.now_ms(),
            phase_duration_ms=INITIAL_PHASE_DURATION_MS,
        ),
    )
