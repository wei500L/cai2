from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.domain.enums import FactionId
from app.protocol.outgoing import BaseEnvelope, OutgoingPayloadModel

NarrationSource = Literal["llm", "template_fallback"]


class EpicNarrationPayload(OutgoingPayloadModel):
    t: Literal["arbitrate.epic_narration"] = Field("arbitrate.epic_narration", exclude=True)
    epoch: int
    source: NarrationSource
    narrative: str = Field(min_length=1, max_length=1000)
    tone: str = Field(min_length=1, max_length=32)
    keyEvents: list[str] = Field(default_factory=list, min_length=1, max_length=6)
    model: str | None = None
    generatedAtMs: int | None = None


class EpicNarrationEvent(BaseEnvelope):
    t: Literal["arbitrate.epic_narration"] = Field("arbitrate.epic_narration", exclude=True)
    p: EpicNarrationPayload


class SummaryHighlightMajorEventPayload(OutgoingPayloadModel):
    id: str
    kind: str
    turn: int
    priority: Literal["P0", "P1", "P2"]
    actor: FactionId | None = None
    target: FactionId | None = None
    narration: str


class SummaryHighlightBattlePayload(OutgoingPayloadModel):
    id: str
    kind: Literal["battle"]
    turn: int
    priority: Literal["P0", "P1", "P2"]
    actor: FactionId
    target: FactionId
    regionId: str
    attackerLoss: float
    defenderLoss: float
    attackerRemainingTroops: float
    defenderRemainingTroops: float
    narration: str


class SummaryHighlightBetrayalPayload(OutgoingPayloadModel):
    id: str
    kind: Literal["betrayal"]
    turn: int
    priority: Literal["P0", "P1", "P2"]
    actor: FactionId
    target: FactionId
    narration: str


class SummaryHighlightBundlePayload(OutgoingPayloadModel):
    majorEvents: list[SummaryHighlightMajorEventPayload] = Field(default_factory=list)
    wars: list[SummaryHighlightBattlePayload] = Field(default_factory=list)
    betrayals: list[SummaryHighlightBetrayalPayload] = Field(default_factory=list)


class SummaryRankingRowPayload(OutgoingPayloadModel):
    id: FactionId
    name: str
    totalPower: float
    previousRank: int
    currentRank: int
    rankDelta: int
    previousPower: float


class SummaryNarrationPayload(OutgoingPayloadModel):
    t: Literal["arbitrate.summary_narration"] = Field(
        "arbitrate.summary_narration",
        exclude=True,
    )
    epoch: int
    source: NarrationSource
    headline: str = Field(min_length=1, max_length=64)
    highlights: SummaryHighlightBundlePayload
    rankings: list[SummaryRankingRowPayload] = Field(default_factory=list)
    model: str | None = None
    generatedAtMs: int | None = None


class SummaryNarrationEvent(BaseEnvelope):
    t: Literal["arbitrate.summary_narration"] = Field("arbitrate.summary_narration", exclude=True)
    p: SummaryNarrationPayload
