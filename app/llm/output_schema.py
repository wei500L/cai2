from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
