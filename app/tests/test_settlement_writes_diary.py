from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import FactionId, GamePhase, PlayerKind, RoomStatus
from app.domain.factions import all_faction_ids
from app.domain.models import EpochTurn, GameRoom, Player
from app.game.initializer import initialize_game_state
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import Repositories, make_repositories
from app.services.settlement_service import SettlementService


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(100_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


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


def _room() -> GameRoom:
    player = _player()
    return GameRoom(
        id="room-1",
        status=RoomStatus.running,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[
            faction_id for faction_id in all_faction_ids() if faction_id != player.faction_id
        ],
        current=EpochTurn(
            epoch=1,
            turn=1,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_started_at_ms=99_000,
            phase_duration_ms=1_000,
        ),
        seed=42,
    )


@pytest.mark.asyncio
async def test_run_turn_settlement_writes_diary_entries(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = _room()
    initial = initialize_game_state(room, clock=clock)
    await repos.rooms.create(room)
    await repos.players.upsert(room.players[0])
    await repos.state.save_factions(room.id, initial.factions)
    await repos.state.save_relationships(room.id, initial.relationships)
    await repos.state.save_regions(room.id, initial.regions)
    await repos.state.save_treaties(room.id, initial.treaties)
    await repos.state.save_current_turn(room.id, room.current)

    service = SettlementService(
        repos=repos,
        clock=clock,
        aggregator=SettlementAggregator(repos, clock),
        prompt_builder=PromptBuilder(),
        llm_client=MockLLMClient(
            deterministic_output={
                "relationship_deltas": [],
                "ai_speeches": [
                    {
                        "faction_id": "ironCrown",
                        "kind": "public",
                        "content": "帝国将按计划推进。",
                        "target_faction": None,
                        "internal_thought": "先稳住局面, 再观察谁会先动摇。",
                    }
                ],
                "treaty_decisions": [],
                "military_judgements": [],
                "culture_impacts": [],
                "morale_impacts": [],
                "narrative_events": [],
                "map_change_suggestions": [],
                "stat_change_suggestions": [],
            }
        ),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=0),
    )

    await service.run_turn_settlement(room.id, room.current.epoch, room.current.turn)

    diaries = await repos.diaries.list_recent(room.id, FactionId.ironCrown, max_entries=10)
    assert len(diaries) == 1
    assert diaries[0].internal_thought == "先稳住局面, 再观察谁会先动摇。"
