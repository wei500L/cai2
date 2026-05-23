from __future__ import annotations

import json
from typing import Any

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import FrozenClock
from app.domain.enums import (
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    TreatyKind,
    VisibilityScope,
)
from app.domain.models import (
    EpochTurn,
    GameRoom,
    MessageVisibility,
    MilitaryAction,
    Player,
    PrivateMessageAction,
    SpeechAction,
    TreatyAction,
)
from app.game.initializer import initialize_game_state
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import Repositories, make_repositories
from app.services.phase_service import ACTION_DURATION_MS
from app.services.settlement_service import (
    SettlementOutboundBundle,
    SettlementService,
)


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


def _empty_model_output() -> dict[str, Any]:
    return {
        "relationship_deltas": [],
        "ai_speeches": [],
        "treaty_decisions": [],
        "military_judgements": [],
        "culture_impacts": [],
        "morale_impacts": [],
        "narrative_events": [],
        "map_change_suggestions": [],
        "stat_change_suggestions": [],
    }


def _treaty_output(treaty_id: str) -> dict[str, Any]:
    payload = _empty_model_output()
    payload["treaty_decisions"] = [
        {
            "treaty_id": treaty_id,
            "accepted": True,
            "reason": "Accepted for protocol coverage.",
            "counter_proposal": None,
        }
    ]
    return payload


def _player() -> Player:
    return Player(
        id="player-1",
        room_id="room-1",
        display_name="player-1",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1_000,
        ready=True,
    )


def _room(ai_factions: list[FactionId]) -> GameRoom:
    player = _player()
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=ai_factions,
        current=EpochTurn(
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=70_000,
            phase_duration_ms=ACTION_DURATION_MS,
        ),
        seed=42,
    )


def _visibility(
    scope: VisibilityScope,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


async def _seed_state(
    repos: Repositories,
    clock: FrozenClock,
    ai_factions: list[FactionId],
) -> GameRoom:
    room = _room(ai_factions)
    initial = initialize_game_state(room, clock=clock)

    await repos.rooms.create(room)
    await repos.players.upsert(room.players[0])
    await repos.state.save_factions(room.id, initial.factions)
    await repos.state.save_relationships(room.id, initial.relationships)
    await repos.state.save_regions(room.id, initial.regions)
    await repos.state.save_treaties(room.id, initial.treaties)
    await repos.state.save_current_turn(room.id, room.current)
    return room


def _service(
    repos: Repositories,
    clock: FrozenClock,
    *,
    llm_output: dict[str, Any] | None = None,
) -> SettlementService:
    return SettlementService(
        repos=repos,
        clock=clock,
        aggregator=SettlementAggregator(repos, clock),
        prompt_builder=PromptBuilder(),
        llm_client=MockLLMClient(deterministic_output=llm_output or _empty_model_output()),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=7),
    )


async def _wire_dispatcher(repos: Repositories) -> tuple[OutboundDispatcher, FakeSocket]:
    manager = ConnectionManager()
    socket = FakeSocket()
    await manager.register("player-1", socket)
    await manager.attach_to_room("player-1", "room-1")
    return OutboundDispatcher(manager, repos), socket


def _envelopes(socket: FakeSocket) -> list[dict[str, Any]]:
    return [json.loads(text) for text in socket.sent_texts]


def _types(socket: FakeSocket) -> list[str]:
    return [envelope["t"] for envelope in _envelopes(socket)]


def _ai_events(bundle: SettlementOutboundBundle) -> list[dict[str, Any]]:
    return bundle.ai_speech_events


def _assert_ai_order(types: list[str], *, expect_reaction: bool) -> None:
    thinking = [index for index, kind in enumerate(types) if kind == "ai.thinking"]
    speak = [index for index, kind in enumerate(types) if kind == "ai.speak"]
    reaction = [index for index, kind in enumerate(types) if kind == "ai.reaction"]

    assert thinking
    assert speak
    assert max(thinking) < min(speak)
    if expect_reaction:
        assert reaction
        assert max(speak) < min(reaction)
    else:
        assert not reaction


@pytest.mark.asyncio
async def test_public_speech_emits_full_thought_speak_reaction_chain() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(80_000)
    ai_factions = [
        FactionId.starlight,
        FactionId.emerald,
        FactionId.ashen,
        FactionId.voidChurch,
        FactionId.aurora,
        FactionId.magma,
    ]
    room = await _seed_state(repos, clock, ai_factions)
    speech = SpeechAction(
        id="speech-1",
        room_id=room.id,
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=80_000,
        visibility=_visibility(VisibilityScope.public),
        mode="speech",
        content="The empire addresses the council.",
        targets=[FactionId.starlight],
    )
    await repos.actions.append(speech)

    dispatcher, socket = await _wire_dispatcher(repos)
    service = _service(repos, clock)

    await dispatcher.dispatch_ai_thinking(room.id)
    bundle = await service.run_turn_settlement(room.id, 1, 2)
    await dispatcher.dispatch_resolve_bundle(room.id, bundle)

    assert len(_ai_events(bundle)) == 12
    assert sum(1 for event in _ai_events(bundle) if event["kind"] == "speech") == 6
    assert sum(1 for event in _ai_events(bundle) if event["kind"] == "ai_reaction") == 6
    for event in _ai_events(bundle):
        if event["kind"] == "ai_reaction":
            assert event["payload"]["target_event_id"] == "speech-1"
        if event["kind"] == "speech":
            assert event["payload"]["kind"] == "public"

    types = _types(socket)
    assert types.count("ai.thinking") == 6
    assert types.count("ai.speak") == 6
    assert types.count("ai.reaction") == 6
    _assert_ai_order(types, expect_reaction=True)


@pytest.mark.asyncio
async def test_private_talk_emits_one_thought_and_one_speak() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(80_000)
    ai_factions = [FactionId.starlight]
    room = await _seed_state(repos, clock, ai_factions)
    private_action = PrivateMessageAction(
        id="private-1",
        room_id=room.id,
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=80_000,
        visibility=_visibility(
            VisibilityScope.faction_pair,
            [FactionId.ironCrown, FactionId.starlight],
        ),
        mode="private",
        content="We should talk quietly.",
        target_faction=FactionId.starlight,
    )
    await repos.actions.append(private_action)

    dispatcher, socket = await _wire_dispatcher(repos)
    service = _service(repos, clock)

    await dispatcher.dispatch_ai_thinking(room.id)
    bundle = await service.run_turn_settlement(room.id, 1, 2)
    await dispatcher.dispatch_resolve_bundle(room.id, bundle)

    assert len(_ai_events(bundle)) == 1
    assert _ai_events(bundle)[0]["kind"] == "private"
    assert _ai_events(bundle)[0]["payload"]["kind"] == "private"

    types = _types(socket)
    assert types.count("ai.thinking") == 1
    assert types.count("ai.speak") == 1
    assert "ai.reaction" not in types
    _assert_ai_order(types, expect_reaction=False)


@pytest.mark.asyncio
async def test_treaty_commentary_emits_related_speaks() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(80_000)
    ai_factions = [FactionId.starlight, FactionId.emerald]
    room = await _seed_state(repos, clock, ai_factions)
    treaty_action = TreatyAction(
        id="treaty-1",
        room_id=room.id,
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=80_000,
        visibility=_visibility(
            VisibilityScope.faction_set,
            [FactionId.ironCrown, FactionId.starlight, FactionId.emerald],
        ),
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight, FactionId.emerald],
        proposal_text="Open trade lanes.",
    )
    await repos.actions.append(treaty_action)

    dispatcher, socket = await _wire_dispatcher(repos)
    service = _service(
        repos,
        clock,
        llm_output=_treaty_output("treaty-1"),
    )

    await dispatcher.dispatch_ai_thinking(room.id)
    bundle = await service.run_turn_settlement(room.id, 1, 2)
    await dispatcher.dispatch_resolve_bundle(room.id, bundle)

    assert len(_ai_events(bundle)) == 2
    assert all(event["kind"] == "speech" for event in _ai_events(bundle))
    assert all(event["payload"]["kind"] == "public" for event in _ai_events(bundle))

    types = _types(socket)
    assert types.count("ai.thinking") == 2
    assert types.count("ai.speak") == 2
    assert "ai.reaction" not in types
    _assert_ai_order(types, expect_reaction=False)


@pytest.mark.asyncio
async def test_declare_war_emits_defender_speak_and_third_party_reactions() -> None:
    repos = make_repositories("memory")
    clock = FrozenClock(80_000)
    ai_factions = [
        FactionId.starlight,
        FactionId.emerald,
        FactionId.ashen,
        FactionId.voidChurch,
    ]
    room = await _seed_state(repos, clock, ai_factions)
    regions = await repos.state.get_regions(room.id)
    target_region = next(region for region in regions if region.owner == FactionId.starlight)
    source_region = next(region for region in regions if region.owner == FactionId.ironCrown)
    military_action = MilitaryAction(
        id="military-1",
        room_id=room.id,
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=80_000,
        visibility=_visibility(VisibilityScope.self, [FactionId.ironCrown]),
        mode="military",
        source_region=source_region.id,
        target_region=target_region.id,
        movement="attack",
        orders_text="Declare open war.",
        troops=20,
    )
    await repos.actions.append(military_action)

    dispatcher, socket = await _wire_dispatcher(repos)
    service = _service(repos, clock)

    await dispatcher.dispatch_ai_thinking(room.id)
    bundle = await service.run_turn_settlement(room.id, 1, 2)
    await dispatcher.dispatch_resolve_bundle(room.id, bundle)

    assert len(_ai_events(bundle)) == 4
    assert sum(1 for event in _ai_events(bundle) if event["kind"] == "speech") == 1
    assert sum(1 for event in _ai_events(bundle) if event["kind"] == "ai_reaction") == 3
    assert _ai_events(bundle)[0]["payload"]["kind"] == "public"
    for event in _ai_events(bundle):
        if event["kind"] == "ai_reaction":
            assert event["payload"]["target_event_id"] == "military-1"

    types = _types(socket)
    assert types.count("ai.thinking") == 4
    assert types.count("ai.speak") == 1
    assert types.count("ai.reaction") == 3
    _assert_ai_order(types, expect_reaction=True)
