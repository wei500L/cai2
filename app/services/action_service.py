from app.core.clock import Clock
from app.core.ids import SequenceGen
from app.repositories.base import AsyncRepository


class ActionService:
    def __init__(
        self,
        action_repository: AsyncRepository[object],
        sequence_gen: SequenceGen,
        clock: Clock,
    ) -> None:
        self._action_repository = action_repository
        self._sequence_gen = sequence_gen
        self._clock = clock

