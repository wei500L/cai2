from __future__ import annotations

from typing import TypeAlias

from app.domain.models import GameRoom, GameState

InitialGameState: TypeAlias = GameState


def initialize_game_state(room: GameRoom) -> InitialGameState:
    raise NotImplementedError("delivered in task 6")
