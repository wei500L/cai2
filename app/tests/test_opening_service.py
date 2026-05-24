from __future__ import annotations

import json

import pytest

from app.core.clock import FrozenClock
from app.domain import FactionId, FactionState, FactionStatusKind, Relationship, RelationshipStatus
from app.llm.client import LLMRequest, LLMResponse
from app.services.opening_service import OpeningService


class FencedOpeningClient:
    async def call_opening_narration(self, request: LLMRequest) -> LLMResponse:
        payload = {
            "world_prologue": (
                "晨曦尚未落地，八大势力已在边境线上重新摆开阵势。"
                "旧盟约摇晃，贸易与军备并行，谁也无法假装这个时代还会保持平静。"
            ),
            "faction_briefs": [
                {
                    "faction_id": "ironCrown",
                    "situation": "铁冠帝国正用秩序与威慑稳住边境。",
                    "goal_hint": "尽快压住对手并巩固前线。",
                }
            ],
            "relationship_backstories": [
                {
                    "from_faction": "ironCrown",
                    "to_faction": "starlight",
                    "backstory": "双方曾在边境贸易中互相依赖，如今却彼此提防。",
                }
            ],
            "opening_events": [
                {
                    "headline": "边境戒严",
                    "narration": "铁冠帝国宣布边境进入戒严状态，所有使团都被要求重新登记。",
                    "involved_factions": ["ironCrown", "starlight"],
                }
            ],
            "faction_speeches": [
                {
                    "faction_id": "ironCrown",
                    "content": "铁冠帝国将捍卫秩序，任何挑衅都将被记录并回应。",
                }
            ],
        }
        return LLMResponse(
            content=json.dumps(payload, ensure_ascii=False),
            model="mock",
            prompt_tokens=None,
            completion_tokens=None,
            latency_ms=0,
        )

    def name(self) -> str:
        return "fenced"


@pytest.mark.asyncio
async def test_generate_opening_content_accepts_fenced_json() -> None:
    service = OpeningService(llm_client=FencedOpeningClient(), clock=FrozenClock(987_654))
    factions = [
        FactionState(
            id=FactionId.ironCrown,
            military=100.0,
            economy=90.0,
            diplomacy=50.0,
            culture=40.0,
            morale=1.0,
            total_power=75.5,
            status=FactionStatusKind.stable,
            eliminated_at_turn=None,
        ),
        FactionState(
            id=FactionId.starlight,
            military=98.0,
            economy=88.0,
            diplomacy=52.0,
            culture=41.0,
            morale=1.0,
            total_power=74.0,
            status=FactionStatusKind.stable,
            eliminated_at_turn=None,
        ),
    ]
    relationships = [
        Relationship(
            from_faction=FactionId.ironCrown,
            to_faction=FactionId.starlight,
            value=-12.0,
            status=RelationshipStatus.wary,
            treaties=[],
            last_changed_turn=1,
        )
    ]

    bundle = await service.generate_opening_content(
        room_id="room-1",
        factions=factions,
        relationships=relationships,
        ai_faction_ids=[FactionId.ironCrown],
    )

    assert bundle.room_id == "room-1"
    assert bundle.generated_at_ms == 987_654
    assert bundle.world_prologue.startswith("晨曦")
    assert bundle.faction_briefs[0]["faction_id"] == "ironCrown"
    assert bundle.opening_events[0]["headline"] == "边境戒严"
    assert bundle.faction_speeches[0]["content"].startswith("铁冠帝国将捍卫秩序")
