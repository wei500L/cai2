from __future__ import annotations

from app.domain.enums import FactionId, FactionStatusKind, RelationshipStatus, TerrainKind
from app.domain.models import FactionState, MapRegion, Relationship
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementInput


def _faction(faction_id: FactionId, military: float) -> FactionState:
    return FactionState(
        id=faction_id,
        military=military,
        economy=100.0,
        diplomacy=50.0,
        culture=30.0,
        morale=1.0,
        total_power=military * 0.35 + 50.0,
        status=FactionStatusKind.stable,
    )


def _input() -> SettlementInput:
    return SettlementInput(
        room_id='room-1',
        epoch=1,
        turn=2,
        generated_at_ms=1_000,
        factions_snapshot=[
            _faction(FactionId.ironCrown, 150.0),
            _faction(FactionId.starlight, 90.0),
        ],
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
        regions_snapshot=[
            MapRegion(
                id='a',
                owner=FactionId.ironCrown,
                resource_value=20.0,
                development_level=1.0,
                terrain=TerrainKind.plains,
                center_lat_lng=(10.0, 20.0),
                min_garrison=10,
                supply_lines=1,
            ),
            MapRegion(
                id='b',
                owner=FactionId.starlight,
                resource_value=20.0,
                development_level=1.0,
                terrain=TerrainKind.plains,
                center_lat_lng=(40.0, 80.0),
                min_garrison=10,
                supply_lines=1,
            ),
        ],
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


def test_animation_params_direction_speed_and_particles_are_valid() -> None:
    params = RuleResolver(deterministic_rng_seed=11)._derive_animation_params(
        _input(),
        source_faction=FactionId.ironCrown,
        target_faction=FactionId.starlight,
        transition='negotiated',
    )

    assert params['direction'] in {
        'south_to_north',
        'north_to_south',
        'east_to_west',
        'west_to_east',
    }
    assert 1.0 <= params['speed'] <= 1.5
    assert params['particles'] == 'neutral'
