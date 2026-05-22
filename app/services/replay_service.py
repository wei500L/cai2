from app.repositories.base import AsyncRepository


class ReplayService:
    def __init__(
        self,
        action_repository: AsyncRepository[object],
        message_repository: AsyncRepository[object],
    ) -> None:
        self._action_repository = action_repository
        self._message_repository = message_repository

