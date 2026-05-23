from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    FactionId,
    FactionStatusKind,
    GamePhase,
    RelationshipStatus,
    TerrainKind,
    TreatyKind,
)
from app.domain.models import DiaryEntry, EpochTurn, FactionState, MapRegion, Relationship, Treaty
from app.game.settlement_aggregator import SettlementAggregator
from app.repositories.factory import Repositories, make_repositories


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(50_000)


def _faction(faction_id: FactionId) -> FactionState:
    return FactionState(
        id=faction_id,
        military=10.0,
        economy=10.0,
        diplomacy=10.0,
        culture=10.0,
        morale=1.0,
        total_power=41.0,
        status=FactionStatusKind.stable,
        eliminated_at_turn=None,
    )


@pytest.mark.asyncio
async def test_aggregator_uses_memory_depth_and_cap(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room_id = "room-1"
    await repos.state.save_factions(room_id, [_faction(faction_id) for faction_id in FactionId])
    await repos.state.save_relationships(
        room_id,
        [
            Relationship(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                value=0.0,
                status=RelationshipStatus.neutral,
                treaties=[],
                last_changed_turn=1,
            )
        ],
    )
    await repos.state.save_regions(
        room_id,
        [
            MapRegion(
                id="region-1",
                owner=FactionId.ironCrown,
                resource_value=10.0,
                development_level=1.0,
                terrain=TerrainKind.plains,
                center_lat_lng=(0.0, 0.0),
                min_garrison=1,
                supply_lines=1,
            )
        ],
    )
    await repos.state.save_treaties(
        room_id,
        [
            Treaty(
                id="treaty-1",
                kind=TreatyKind.trade,
                parties=[FactionId.ironCrown, FactionId.starlight],
                started_epoch=1,
                started_turn=1,
                active=True,
            )
        ],
    )
    await repos.state.save_current_turn(
        room_id,
        EpochTurn(
            epoch=2,
            turn=3,
            phase=GamePhase.resolve,
            arbitrate_phase=None,
            phase_started_at_ms=49_000,
            phase_duration_ms=1_000,
        ),
    )

    for index in range(5):
        await repos.diaries.append(
            DiaryEntry(
                faction_id=FactionId.ironCrown,
                epoch=1,
                turn=index + 1,
                internal_thought=f"iron-{index + 1}",
                emotion="cold",
                triggers=[],
                created_at_ms=1_000 + index,
            ),
            room_id=room_id,
        )

    for index in range(100):
        await repos.diaries.append(
            DiaryEntry(
                faction_id=FactionId.starlight,
                epoch=1,
                turn=index + 1,
                internal_thought=f"star-{index + 1}",
                emotion="calm",
                triggers=[],
                created_at_ms=2_000 + index,
            ),
            room_id=room_id,
        )

    aggregator = SettlementAggregator(repos, clock)
    input_data = await aggregator.aggregate(room_id, 2, 3)

    assert len(input_data.faction_recent_diaries[FactionId.ironCrown]) == 3
    iron_diaries = input_data.faction_recent_diaries[FactionId.ironCrown]
    assert [entry.internal_thought for entry in iron_diaries] == [
        "iron-3",
        "iron-4",
        "iron-5",
    ]
    assert len(input_data.faction_recent_diaries[FactionId.starlight]) == 80
    assert input_data.faction_recent_diaries[FactionId.starlight][0].internal_thought == "star-21"
