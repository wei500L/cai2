from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.enums import FactionId


class AIReaction(BaseModel):
    faction_id: FactionId
    emotion: str
    target_faction: FactionId | None = None


class RelationshipDelta(BaseModel):
    from_faction: FactionId
    to_faction: FactionId
    delta: float = Field(ge=-30.0, le=30.0)
    reason: str


class TreatyDecision(BaseModel):
    treaty_id: str
    accepted: bool
    reason: str
    counter_proposal: str | None = None


class MilitaryJudgement(BaseModel):
    region_id: str
    attacker: FactionId | None = None
    defender: FactionId | None = None
    legitimacy: Literal["just", "neutral", "unjust"]
    narrative: str


class CultureImpact(BaseModel):
    faction_id: FactionId
    delta: float = Field(ge=-20.0, le=20.0)
    reason: str


class MoraleImpact(BaseModel):
    faction_id: FactionId
    delta: float = Field(ge=-0.2, le=0.2)
    reason: str


class NarrativeEvent(BaseModel):
    kind: Literal[
        "betrayal",
        "alliance",
        "declare_war",
        "intel_leak",
        "golden_age",
        "civil_unrest",
        "custom",
    ]
    actor: FactionId | None = None
    target: FactionId | None = None
    narration: str


class MapChangeSuggestion(BaseModel):
    region_id: str
    new_owner: FactionId | None = None
    reason: str


class StatChangeSuggestion(BaseModel):
    faction_id: FactionId
    military_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    economy_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    diplomacy_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    culture_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    morale_delta: float = Field(default=0.0, ge=-0.1, le=0.1)


class AISpeechItem(BaseModel):
    faction_id: FactionId
    kind: Literal["public", "private", "reaction", "narration"]
    content: str = Field(min_length=1, max_length=400)
    target_faction: FactionId | None = None
    target_event_id: str | None = None
    internal_thought: str | None = Field(default=None, max_length=600)


class SettlementModelOutput(BaseModel):
    model_config = ConfigDict(strict=False, extra="ignore")

    relationship_deltas: list[RelationshipDelta] = Field(default_factory=list)
    ai_speeches: list[AISpeechItem] = Field(default_factory=list)
    treaty_decisions: list[TreatyDecision] = Field(default_factory=list)
    military_judgements: list[MilitaryJudgement] = Field(default_factory=list)
    culture_impacts: list[CultureImpact] = Field(default_factory=list)
    morale_impacts: list[MoraleImpact] = Field(default_factory=list)
    narrative_events: list[NarrativeEvent] = Field(default_factory=list)
    map_change_suggestions: list[MapChangeSuggestion] = Field(default_factory=list)
    stat_change_suggestions: list[StatChangeSuggestion] = Field(default_factory=list)


class EpicNarrationModelOutput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    narrative: str = Field(min_length=200, max_length=600)
    tone: str = Field(min_length=1, max_length=32)
    key_events: list[str] = Field(default_factory=list, min_length=1, max_length=6)


class SummaryRankingItem(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    faction_id: FactionId
    rank: int = Field(ge=1, le=8)
    previous_rank: int | None = Field(default=None, ge=1, le=8)
    movement: Literal["up", "down", "flat"]
    total_power: float
    delta: float


class SummaryHighlightItem(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    kind: Literal["war", "speech", "betrayal", "alliance", "trade", "rank_change", "other"]
    text: str = Field(min_length=1, max_length=120)


class SummaryNarrationModelOutput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    headline: str = Field(min_length=4, max_length=64)
    rankings: list[SummaryRankingItem] = Field(default_factory=list, min_length=1, max_length=8)
    highlights: list[SummaryHighlightItem] = Field(
        default_factory=list,
        min_length=2,
        max_length=6,
    )


class ExplosionJudgeOutput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", validate_assignment=True)

    affected_hex_ids: list[str] = Field(default_factory=list, min_length=1, max_length=16)
    primary_hex_id: str = Field(max_length=32)
    scorched_turns: int = Field(ge=0, le=6)
    fallout_severity: float = Field(ge=0.0, le=1.0)
    economic_loss_pct: float = Field(ge=0.0, le=1.0)
    narrative_hint: str = Field(min_length=1, max_length=240)

    @field_validator("affected_hex_ids")
    @classmethod
    def _dedupe_affected_hex_ids(cls, value: list[str]) -> list[str]:
        ordered: list[str] = []
        seen: set[str] = set()
        for hex_id in value:
            if hex_id in seen:
                continue
            seen.add(hex_id)
            ordered.append(hex_id)
        return ordered

    @model_validator(mode="after")
    def _validate_primary_hex(self) -> ExplosionJudgeOutput:
        if self.primary_hex_id not in self.affected_hex_ids:
            raise ValueError("primary_hex_id must be included in affected_hex_ids")
        if len(self.affected_hex_ids) > 16:
            raise ValueError("affected_hex_ids must contain at most 16 items")
        if self.affected_hex_ids and self.affected_hex_ids[0] != self.primary_hex_id:
            ordered = [
                self.primary_hex_id,
                *[hex_id for hex_id in self.affected_hex_ids if hex_id != self.primary_hex_id],
            ]
            object.__setattr__(self, "affected_hex_ids", ordered[:16])
        return self
