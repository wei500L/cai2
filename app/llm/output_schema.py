from pydantic import BaseModel, ConfigDict, Field


class SettlementModelOutput(BaseModel):
    model_config = ConfigDict(strict=True)

    summary: str = ""
    decision: str = ""
    notes: list[str] = Field(default_factory=list)

