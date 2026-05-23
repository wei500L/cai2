from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.domain.enums import FactionId
from app.protocol.outgoing import BaseEnvelope, OutgoingPayloadModel

ExplosionKind = Literal["conventional", "aerial", "naval", "siege", "uprising", "nuke"]


class ExplosionPayload(OutgoingPayloadModel):
    t: Literal["resolve.event.explosion"] = Field("resolve.event.explosion", exclude=True)
    id: str
    turn: int
    attacker_faction: FactionId
    defender_faction: FactionId
    center_lat: float = Field(ge=-90.0, le=90.0)
    center_lng: float = Field(ge=-180.0, le=180.0)
    radius_km_estimate: int = Field(ge=0, le=1000)
    kind: ExplosionKind
    intensity: float = Field(ge=0.2, le=1.0)
    ttl_ms: int = Field(gt=0)
    casualties_estimate: int = Field(ge=0)
    affected_hex_ids: list[str] = Field(default_factory=list)


class ExplosionEvent(BaseEnvelope):
    t: Literal["resolve.event.explosion"] = Field("resolve.event.explosion", exclude=True)
    p: ExplosionPayload
