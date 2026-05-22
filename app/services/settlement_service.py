from app.core.clock import Clock
from app.llm.client import LLMClient


class SettlementService:
    def __init__(self, llm_client: LLMClient, clock: Clock) -> None:
        self._llm_client = llm_client
        self._clock = clock

