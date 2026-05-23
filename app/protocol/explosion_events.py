from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.domain.enums import FactionId
from app.protocol.outgoing import BaseEnvelope, OutgoingPayloadModel

ExplosionKind = Literal[
    "nuke",
    "conventional",
    "aerial",
    "naval",
    "siege",
    "uprising",
    "artillery",
    "missile",
    "other",
]


class ExplosionPayload(OutgoingPayloadModel):
    t: Literal["resolve.event.explosion"] = Field("resolve.event.explosion", exclude=True)
    room_id: str
    epoch: int
    turn: int
    event_id: str
    source_region_id: str | None = None
    kind: ExplosionKind
    primary_hex_id: str = Field(max_length=32)
    affected_hex_ids: list[str] = Field(default_factory=list, max_length=16)
    scorched_turns: int = Field(ge=0, le=6)
    fallout_severity: float = Field(ge=0.0, le=1.0)
    economic_loss_pct: float = Field(ge=0.0, le=1.0)
    narrative_hint: str = Field(min_length=1, max_length=240)
    intensity: float = Field(ge=0.0, le=3.0)
    cinematic_hint: Literal["nuke_cinematic", "focus_short", "focus_long", "none"] = "none"

    @field_validator("affected_hex_ids")
    @classmethod
    def _dedupe_affected(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for hex_id in value:
            if hex_id in seen:
                continue
            seen.add(hex_id)
            ordered.append(hex_id)
        return ordered

    @model_validator(mode="after")
    def _validate_primary(self) -> ExplosionPayload:
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


class ScorchedChange(OutgoingPayloadModel):
    hex_id: str = Field(max_length=32)
    status: Literal["applied", "updated", "advanced", "recovered"]
    turn: int
    since_turn: int | None = None
    ttl_turns: int | None = None
    severity: float = Field(ge=0.0, le=1.0)
    fallout: float = Field(ge=0.0, le=1.0)
    resource_value: float = Field(ge=0.0)
    owner_faction_id: FactionId | None = None
    source_event_id: str | None = None


class ScorchedDiffPayload(OutgoingPayloadModel):
    t: Literal["resolve.scorched_diff"] = Field("resolve.scorched_diff", exclude=True)
    room_id: str
    epoch: int
    turn: int
    changes: list[ScorchedChange] = Field(default_factory=list)


class ExplosionEvent(BaseEnvelope):
    t: Literal["resolve.event.explosion"] = Field("resolve.event.explosion", exclude=True)
    p: ExplosionPayload


class ScorchedDiffEvent(BaseEnvelope):
    t: Literal["resolve.scorched_diff"] = Field("resolve.scorched_diff", exclude=True)
    p: ScorchedDiffPayload


ExplosionEnvelope: type[BaseEnvelope] = ExplosionEvent
ScorchedDiffEnvelope: type[BaseEnvelope] = ScorchedDiffEvent
