from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import FactionId

SpeechStyle = Literal[
    "noble",
    "cautious",
    "pragmatic",
    "fervent",
    "mystic",
    "scholarly",
    "aggressive",
    "shadowy",
]


class FactionMeta(BaseModel):
    model_config = ConfigDict(strict=True, frozen=True, validate_assignment=True, extra="forbid")

    id: FactionId
    name: str
    short_name: str
    primary_color: str = Field(pattern=r"^#[0-9A-F]{6}$")
    glow_color: str = Field(pattern=r"^#[0-9A-F]{6}$")
    shadow_color: str = Field(pattern=r"^#[0-9A-F]{6}$")
    speech_style: SpeechStyle
    speech_style_label: str
    speech_style_description: str
    civilization_traits: list[str] = Field(min_length=3, max_length=4)
    ai_archetype: str
    capital_hex_id: str | None = None


def validate_complete_faction_meta(meta_by_id: dict[FactionId, FactionMeta]) -> None:
    expected = set(FactionId)
    actual = set(meta_by_id)
    if actual != expected:
        missing = sorted(faction_id.value for faction_id in expected - actual)
        extra = sorted(str(faction_id) for faction_id in actual - expected)
        raise ValueError(
            f"faction meta must cover all faction ids: missing={missing}, extra={extra}"
        )
