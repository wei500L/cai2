from __future__ import annotations

from random import Random
from unittest.mock import Mock

import pytest

import app.llm
from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    VisibilityScope,
)
from app.domain.models import EpochTurn, FactionState, GameEvent, MessageVisibility
from app.llm.output_schema import SettlementModelOutput
from app.repositories.factory import Repositories, make_repositories
from app.services.ai_output_service import AIOutputBundle, AIOutputService, fallback_generate
from app.services.ai_templates import (
    AI_PRIVATE_TEMPLATES,
    AI_REACTION_TEMPLATES,
    AI_SPEECH_TEMPLATES,
    SYSTEM_NARRATION_TEMPLATES,
)


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(123_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


def _factions() -> list[FactionState]:
    return [
        FactionState(
            id=faction_id,
            military=100.0,
            economy=100.0,
            diplomacy=100.0,
            culture=100.0,
            morale=1.0,
            total_power=100.0,
            status=FactionStatusKind.stable,
        )
        for faction_id in FactionId
    ]


async def _seed_current_turn(repos: Repositories, room_id: str = "room-1") -> None:
    await repos.state.save_current_turn(
        room_id,
        EpochTurn(
            epoch=1,
            turn=2,
            phase=GamePhase.resolve,
            arbitrate_phase=None,
            phase_started_at_ms=120_000,
            phase_duration_ms=30_000,
        ),
    )
    await repos.state.save_factions(room_id, _factions())


def _recent_event(
    *,
    event_id: str = "event-1",
    kind: EventKind = EventKind.battle,
    narration: str = "边境爆发冲突。",
) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.resolve,
        created_at_ms=100_000,
        priority=EventPriority.P1,
        kind=kind,
        actor_faction=FactionId.ironCrown,
        target_faction=FactionId.starlight,
        payload={},
        narration=narration,
        visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
    )


@pytest.mark.asyncio
async def test_model_ai_speeches_write_events_and_private_message_log(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_current_turn(repos)
    model_output = SettlementModelOutput.model_validate(
        {
            "ai_speeches": [
                {
                    "faction_id": "starlight",
                    "kind": "public",
                    "content": "星辉联邦要求公开核验边境数据。",
                },
                {
                    "faction_id": "emerald",
                    "kind": "private",
                    "content": "朋友, 这场误会可以用更低成本解决。",
                    "target_faction": "ironCrown",
                },
                {
                    "faction_id": "ashen",
                    "kind": "reaction",
                    "content": "这才像个挑战!",
                    "target_faction": "ironCrown",
                },
            ]
        }
    )
    service = AIOutputService(repos=repos, clock=clock, rng_seed=7)

    bundle = await service.generate_ai_reactions_from_settlement(
        "room-1",
        1,
        2,
        model_output,
        factions_snapshot=_factions(),
        recent_events=[],
    )

    assert isinstance(bundle, AIOutputBundle)
    assert len(bundle.ai_speak_events) == 1
    assert len(bundle.private_message_events) == 1
    assert len(bundle.ai_reaction_events) == 1
    events = await repos.events.list_by_turn("room-1", 1, 2)
    assert [event.kind for event in events] == [
        EventKind.speech,
        EventKind.private,
        EventKind.ai_reaction,
    ]
    messages = await repos.messages.list_by_turn("room-1", 1, 2)
    assert len(messages) == 1
    assert messages[0].from_faction == FactionId.emerald
    assert messages[0].to_factions == [FactionId.ironCrown]


@pytest.mark.asyncio
async def test_empty_ai_speeches_uses_fallback_templates(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_current_turn(repos)
    service = AIOutputService(repos=repos, clock=clock, rng_seed=11)

    bundle = await service.generate_ai_reactions_from_settlement(
        "room-1",
        1,
        2,
        SettlementModelOutput(),
        factions_snapshot=_factions(),
        recent_events=[_recent_event()],
    )

    total = (
        len(bundle.ai_speak_events)
        + len(bundle.ai_reaction_events)
        + len(bundle.private_message_events)
        + len(bundle.narration_events)
    )
    assert total >= 1
    assert await repos.events.list_by_turn("room-1", 1, 2)


@pytest.mark.asyncio
async def test_private_ai_message_can_be_listed_between_factions(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_current_turn(repos)
    service = AIOutputService(repos=repos, clock=clock, rng_seed=17)

    await service.generate_ai_private_messages(
        "room-1",
        FactionId.darkTide,
        [FactionId.emerald],
        context_hint="贸易路线",
    )

    messages = await repos.messages.list_private_between(
        "room-1",
        [FactionId.darkTide, FactionId.emerald],
    )
    assert len(messages) == 1
    assert messages[0].visibility.scope == VisibilityScope.faction_pair
    assert "贸易路线" in messages[0].content


@pytest.mark.asyncio
async def test_generate_ai_public_speech_does_not_call_llm(
    repos: Repositories,
    clock: FrozenClock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_current_turn(repos)
    llm_sentinel = Mock(side_effect=AssertionError("LLM must not be called"))
    monkeypatch.setattr(app.llm, "client", llm_sentinel, raising=False)
    service = AIOutputService(repos=repos, clock=clock, rng_seed=23)

    event = await service.generate_ai_public_speech("room-1", FactionId.ironCrown)

    assert event["kind"] == EventKind.speech.value
    llm_sentinel.assert_not_called()


@pytest.mark.asyncio
async def test_same_rng_seed_and_input_are_deterministic(clock: FrozenClock) -> None:
    first_repos = make_repositories("memory")
    second_repos = make_repositories("memory")
    await _seed_current_turn(first_repos)
    await _seed_current_turn(second_repos)
    first_service = AIOutputService(repos=first_repos, clock=clock, rng_seed=99)
    second_service = AIOutputService(repos=second_repos, clock=clock, rng_seed=99)
    model_output = SettlementModelOutput()
    recent_events = [_recent_event()]

    first = await first_service.generate_ai_reactions_from_settlement(
        "room-1",
        1,
        2,
        model_output,
        factions_snapshot=_factions(),
        recent_events=recent_events,
    )
    second = await second_service.generate_ai_reactions_from_settlement(
        "room-1",
        1,
        2,
        model_output,
        factions_snapshot=_factions(),
        recent_events=recent_events,
    )

    assert first.model_dump() == second.model_dump()


def test_fallback_generate_returns_template_speeches() -> None:
    generated = fallback_generate(_factions(), [_recent_event()], rng=Random(31))

    assert len(generated) >= 1
    assert all(item["content"] for item in generated)


def test_templates_cover_all_eight_factions_with_at_least_six_entries() -> None:
    for template_map in (AI_SPEECH_TEMPLATES, AI_REACTION_TEMPLATES, AI_PRIVATE_TEMPLATES):
        assert set(template_map) == set(FactionId)
        assert all(len(templates) >= 6 for templates in template_map.values())
    assert SYSTEM_NARRATION_TEMPLATES
    assert any("{epoch}" in template for template in SYSTEM_NARRATION_TEMPLATES)
