from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.domain.enums import FactionId, FactionStatusKind, RelationshipStatus, TerrainKind
from app.domain.models import FactionState, MapRegion, Relationship
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementInput


def _faction(faction_id: FactionId, military: float, morale: float = 1.0) -> FactionState:
    return FactionState(
        id=faction_id,
        military=military,
        economy=100.0,
        diplomacy=50.0,
        culture=30.0,
        morale=morale,
        total_power=military * 0.35 + 100.0 * 0.25 + 50.0 * 0.25 + 30.0 * 0.15,
        status=FactionStatusKind.stable,
    )


def _region(region_id: str, owner: FactionId, lat: float, lng: float) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=40.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(lat, lng),
        min_garrison=10,
        supply_lines=2,
    )


def _input() -> SettlementInput:
    attacker = _faction(FactionId.ironCrown, 180.0, morale=1.1)
    defender = _faction(FactionId.starlight, 42.0, morale=0.9)
    return SettlementInput(
        room_id='room-1',
        epoch=1,
        turn=2,
        generated_at_ms=1_000,
        factions_snapshot=[attacker, defender],
        relationships_snapshot=[
            Relationship(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                value=-70.0,
                status=RelationshipStatus.hostile,
                treaties=[],
                last_changed_turn=1,
            )
        ],
        regions_snapshot=[
            _region('region-a', FactionId.ironCrown, 10.0, 20.0),
            _region('region-b', FactionId.starlight, 40.0, 80.0),
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


def test_compute_battle_fills_remaining_troops() -> None:
    input_state = _input()
    attacker = input_state.factions_snapshot[0]
    defender = input_state.factions_snapshot[1]
    region = input_state.regions_snapshot[1]

    result = RuleResolver(deterministic_rng_seed=7)._compute_battle(
        attacker,
        defender,
        region,
        input_state,
    )

    assert result.attacker_remaining_troops == pytest.approx(attacker.military - result.atk_loss)
    assert result.defender_remaining_troops == pytest.approx(defender.military - result.def_loss)
    assert isinstance(result.territory_captured, bool)

    event = RuleResolver(deterministic_rng_seed=7)._battle_event(input_state, 0, result)
    assert event.payload["attacker_remaining_troops"] == result.attacker_remaining_troops
    assert event.payload["defender_remaining_troops"] == result.defender_remaining_troops
    assert event.payload["region_id"] == region.id


def test_apply_map_changes_emits_conquest_animation_params() -> None:
    input_state = _input()
    resolver = RuleResolver(deterministic_rng_seed=7)
    result = resolver._compute_battle(
        input_state.factions_snapshot[0],
        input_state.factions_snapshot[1],
        input_state.regions_snapshot[1],
        input_state,
    )
    if not result.territory_captured:
        result = result.model_copy(update={'territory_captured': True})

    changes = resolver.apply_map_changes(
        input_state,
        model_output=SimpleNamespace(map_change_suggestions=[]),
        battle_results=[result],
    )
    change = next(item for item in changes if item.region_id == 'region-b')

    assert change.transition == 'conquest'
    assert change.animation_params['direction'] in {
        'south_to_north',
        'north_to_south',
        'east_to_west',
        'west_to_east',
    }
    assert 1.0 <= change.animation_params['speed'] <= 1.5
    assert change.animation_params['particles'] == 'aggressive'


def test_derive_animation_params_uses_orientation() -> None:
    input_state = _input()
    resolver = RuleResolver(deterministic_rng_seed=7)

    conquest = resolver._derive_animation_params(
        input_state,
        source_faction=FactionId.ironCrown,
        target_faction=FactionId.starlight,
        transition='conquest',
    )

    assert conquest['direction'] in {
        'south_to_north',
        'north_to_south',
        'east_to_west',
        'west_to_east',
    }
    assert conquest['particles'] == 'aggressive'
