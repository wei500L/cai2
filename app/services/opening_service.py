# ruff: noqa: RUF001, RUF002, RUF003
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.clock import Clock
from app.core.logging import get_logger
from app.domain.enums import FactionId, RelationshipStatus
from app.domain.factions import FACTION_META, all_faction_ids
from app.domain.models import FactionState, Relationship
from app.llm.client import LLMClient, LLMRequest
from app.llm.output_schema import OpeningNarrationModelOutput
from app.llm.prompt_builder import OpeningNarrationPrompt, PromptBuilder

logger = get_logger(__name__)


class OpeningContentBundle(BaseModel):
    model_config = ConfigDict(strict=True)

    room_id: str
    generated_at_ms: int
    world_prologue: str
    faction_briefs: list[dict[str, Any]] = Field(default_factory=list)
    relationship_backstories: list[dict[str, Any]] = Field(default_factory=list)
    opening_events: list[dict[str, Any]] = Field(default_factory=list)
    faction_speeches: list[dict[str, Any]] = Field(default_factory=list)


class OpeningService:
    def __init__(
        self,
        *,
        llm_client: LLMClient,
        clock: Clock,
    ) -> None:
        self._llm = llm_client
        self._clock = clock
        self._prompt_builder = PromptBuilder()

    async def generate_opening_content(
        self,
        *,
        room_id: str,
        factions: list[FactionState],
        relationships: list[Relationship],
        ai_faction_ids: list[FactionId],
    ) -> OpeningContentBundle:
        prompt = self._build_prompt(
            factions=factions,
            relationships=relationships,
            ai_faction_ids=ai_faction_ids,
        )

        request = LLMRequest(
            system=prompt.system,
            user=prompt.user,
            temperature=prompt.temperature,
            max_tokens=prompt.max_tokens,
            metadata={"kind": "opening_narration"},
        )

        response = await self._llm.call_opening_narration(request)
        parsed = OpeningNarrationModelOutput.model_validate_json(response.content)

        return OpeningContentBundle(
            room_id=room_id,
            generated_at_ms=self._clock.now_ms(),
            world_prologue=parsed.world_prologue,
            faction_briefs=[b.model_dump(mode="json") for b in parsed.faction_briefs],
            relationship_backstories=[
                b.model_dump(mode="json") for b in parsed.relationship_backstories
            ],
            opening_events=[e.model_dump(mode="json") for e in parsed.opening_events],
            faction_speeches=[s.model_dump(mode="json") for s in parsed.faction_speeches],
        )

    def _build_prompt(
        self,
        *,
        factions: list[FactionState],
        relationships: list[Relationship],
        ai_faction_ids: list[FactionId],
    ) -> OpeningNarrationPrompt:
        relationships_summary = self._format_relationships(relationships)
        faction_ids = list(all_faction_ids())

        return self._prompt_builder.build_opening_narration_prompt(
            faction_ids=faction_ids,
            relationships_summary=relationships_summary,
            ai_faction_ids=ai_faction_ids,
        )

    def _format_relationships(self, relationships: list[Relationship]) -> str:
        notable: list[str] = []
        seen: set[frozenset[FactionId]] = set()
        for rel in relationships:
            if rel.status == RelationshipStatus.neutral:
                continue
            pair = frozenset({rel.from_faction, rel.to_faction})
            if pair in seen:
                continue
            seen.add(pair)
            from_name = FACTION_META[rel.from_faction].name
            to_name = FACTION_META[rel.to_faction].name
            notable.append(
                f"- {rel.from_faction.value}({from_name}) ↔ "
                f"{rel.to_faction.value}({to_name}): "
                f"{rel.status.value}({rel.value:+.0f})"
            )
        return "\n".join(notable) if notable else "- 所有势力关系均为中立"
