from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    RelationshipStatus,
    TerrainKind,
    VisibilityScope,
)
from app.domain.models import (
    BattleEvent,
    FactionState,
    MapRegion,
    MessageVisibility,
    RegionChange,
    Relationship,
    SettlementResult,
)
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementInput
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import make_repositories
from app.services.settlement_service import SettlementService


def _region(region_id: str, owner: FactionId) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=32.0,
        development_level=1.2,
        terrain=TerrainKind.plains,
        center_lat_lng=(24.0, 72.0),
        min_garrison=10,
        supply_lines=2,
    )


def _faction(faction_id: FactionId) -> FactionState:
    return FactionState(
        id=faction_id,
        military=100.0,
        economy=100.0,
        diplomacy=50.0,
        culture=30.0,
        morale=1.0,
        total_power=67.5,
        status=FactionStatusKind.stable,
    )


@pytest.mark.asyncio
async def test_apply_region_changes_updates_owner_and_capture_metadata() -> None:
    repos = make_repositories('memory')
    clock = FrozenClock(1_000)
    service = SettlementService(
        repos=repos,
        clock=clock,
        aggregator=None,  # type: ignore[arg-type]
        prompt_builder=PromptBuilder(),
        llm_client=MockLLMClient(deterministic_output={}),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=3),
    )
    input_state = SettlementInput(
        room_id='room-1',
        epoch=1,
        turn=4,
        generated_at_ms=1_000,
        factions_snapshot=[_faction(FactionId.ironCrown), _faction(FactionId.starlight)],
        relationships_snapshot=[
            Relationship(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                value=-30.0,
                status=RelationshipStatus.wary,
                treaties=[],
                last_changed_turn=1,
            )
        ],
        regions_snapshot=[_region('region-1', FactionId.starlight)],
        treaties_snapshot=[],
        turn_actions=[],
        public_speeches=[],
        private_messages=[],
        treaty_requests=[],
        military_orders=[],
        intel_actions=[],
        recent_events=[],
        faction_recent_diaries={},
        faction_personality_summary={},
        relationship_summary_text='',
        faction_stats_summary_text='',
    )
    settlement_result = SettlementResult(
        room_id='room-1',
        epoch=1,
        turn=4,
        generated_at_ms=1_000,
        battle_results=[
            BattleEvent(
                id='battle-1',
                room_id='room-1',
                epoch=1,
                turn=4,
                phase=GamePhase.resolve,
                created_at_ms=1_000,
                priority=EventPriority.P0,
                kind=EventKind.battle,
                actor_faction=FactionId.ironCrown,
                target_faction=FactionId.starlight,
                payload={},
                narration='battle',
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
                attacker=FactionId.ironCrown,
                defender=FactionId.starlight,
                region_id='region-1',
                atk_loss=8.0,
                def_loss=20.0,
                territory_captured=True,
                morale_shift=0.04,
                attacker_remaining_troops=92.0,
                defender_remaining_troops=20.0,
            )
        ],
        region_changes=[
            RegionChange(
                region_id='region-1',
                prev_owner=FactionId.starlight,
                new_owner=FactionId.ironCrown,
                transition='conquest',
                animation_params={
                    'direction': 'west_to_east',
                    'speed': 1.2,
                    'particles': 'aggressive',
                },
            )
        ],
        relationship_deltas=[],
        treaty_decisions=[],
        created_treaties=[],
        faction_stat_changes=[],
        narration_events=[],
        ai_speeches=[],
    )

    await repos.state.save_regions('room-1', input_state.regions_snapshot)
    await service._apply_settlement_to_state(input_state, settlement_result)

    regions = await repos.state.get_regions('room-1')
    region = next(item for item in regions if item.id == 'region-1')
    assert region.owner == FactionId.ironCrown
    assert region.development_level == pytest.approx(0.3)
    assert region.resistance == pytest.approx(0.5)
    assert region.captured_at_turn == 4
