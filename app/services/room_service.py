from app.core.clock import Clock
from app.repositories.base import AsyncRepository


class RoomService:
    def __init__(self, room_repository: AsyncRepository[object], clock: Clock) -> None:
        self._room_repository = room_repository
        self._clock = clock

