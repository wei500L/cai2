from __future__ import annotations

from types import SimpleNamespace

from app.domain.enums import FactionId, TerrainKind
from app.domain.models import MapRegion, RegionChange, SettlementResult
from app.services.settlement_service import _build_map_diff


def _region(region_id: str, owner: FactionId | None) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=18.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(10.0, 20.0),
        min_garrison=10,
        supply_lines=1,
    )


def test_resolve_map_diff_changes_include_full_contract_fields() -> None:
    input_state = SimpleNamespace(
        regions_snapshot=[_region('region-1', FactionId.starlight)],
        relationships_snapshot=[],
    )
    result = SettlementResult(
        room_id='room-1',
        epoch=1,
        turn=2,
        generated_at_ms=1_000,
        region_changes=[
            RegionChange(
                region_id='region-1',
                prev_owner=FactionId.starlight,
                new_owner=FactionId.ironCrown,
                transition='conquest',
                animation_params={
                    'direction': 'south_to_north',
                    'speed': 1.25,
                    'particles': 'aggressive',
                },
            )
        ],
        battle_results=[],
        relationship_deltas=[],
        treaty_decisions=[],
        created_treaties=[],
        faction_stat_changes=[],
        narration_events=[],
        ai_speeches=[],
    )

    bundle = _build_map_diff(result, input_state)

    assert bundle['changes'] == [
        {
            'region_id': 'region-1',
            'prev_owner': 'starlight',
            'new_owner': 'ironCrown',
            'transition': 'conquest',
            'animation_params': {
                'direction': 'south_to_north',
                'speed': 1.25,
                'particles': 'aggressive',
            },
            'previous': {
                'id': 'region-1',
                'owner': 'starlight',
                'resource_value': 18.0,
                'development_level': 1.0,
                'terrain': 'plains',
                'center_lat_lng': [10.0, 20.0],
                'min_garrison': 10,
                'supply_lines': 1,
                'neighbors': [],
                'resistance': 0.0,
                'captured_at_turn': None,
            },
        }
    ]
