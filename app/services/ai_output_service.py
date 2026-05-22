from app.llm.client import LLMClient


class AIOutputService:
    def __init__(self, llm_client: LLMClient) -> None:
        self._llm_client = llm_client

