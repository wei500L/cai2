from app.domain.models import GameState


def build_initial_game_state(*, room_id: str, created_at_ms: int) -> GameState:
    raise NotImplementedError("Game initialization will be implemented in a later task.")

