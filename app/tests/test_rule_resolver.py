from __future__ import annotations

from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    RelationshipStatus,
    TerrainKind,
    TreatyKind,
    VisibilityScope,
)
from app.domain.models import (
    FactionState,
    GameAction,
    GameEvent,
    MapRegion,
    MessageVisibility,
    MilitaryAction,
    Relationship,
    SettlementResult,
    Treaty,
    TreatyAction,
)
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementInput
from app.llm import output_schema as llm_schema


def _faction(
    faction_id: FactionId,
    *,
    military: float = 100.0,
    economy: float = 100.0,
    diplomacy: float = 50.0,
    culture: float = 30.0,
    morale: float = 1.0,
) -> FactionState:
    return FactionState(
        id=faction_id,
        military=military,
        economy=economy,
        diplomacy=diplomacy,
        culture=culture,
        morale=morale,
        total_power=_total_power(military, economy, diplomacy, culture),
        status=FactionStatusKind.stable,
    )


def _total_power(military: float, economy: float, diplomacy: float, culture: float) -> float:
    return round(military * 0.35 + economy * 0.25 + diplomacy * 0.25 + culture * 0.15, 4)


def _visibility(
    scope: VisibilityScope = VisibilityScope.public,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


def _relationship(
    from_faction: FactionId,
    to_faction: FactionId,
    value: float,
) -> Relationship:
    return Relationship(
        from_faction=from_faction,
        to_faction=to_faction,
        value=value,
        status=RelationshipStatus.neutral,
        treaties=[],
        last_changed_turn=1,
    )


def _region(
    region_id: str,
    owner: FactionId,
    *,
    terrain: TerrainKind = TerrainKind.plains,
    min_garrison: int = 10,
    resource_value: float = 50.0,
) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=owner,
        resource_value=resource_value,
        development_level=1.0,
        terrain=terrain,
        center_lat_lng=(0.0, 0.0),
        min_garrison=min_garrison,
        supply_lines=2,
    )


def _base_action_payload(action_id: str, actor_faction: FactionId) -> dict[str, object]:
    return {
        "id": action_id,
        "room_id": "room-1",
        "epoch": 1,
        "turn": 2,
        "phase": GamePhase.action,
        "actor_player_id": "player-1",
        "actor_faction": actor_faction,
        "created_at_ms": 10_000,
    }


def _treaty_action(
    action_id: str = "treaty-1",
    *,
    actor_faction: FactionId = FactionId.ironCrown,
    target: FactionId = FactionId.starlight,
    kind: TreatyKind = TreatyKind.trade,
) -> TreatyAction:
    return TreatyAction(
        **_base_action_payload(action_id, actor_faction),
        visibility=_visibility(VisibilityScope.faction_set, [actor_faction, target]),
        mode="treaty",
        treaty_kind=kind,
        target_factions=[target],
        proposal_text="Open trade lanes.",
    )


def _military_action(
    action_id: str = "military-1",
    *,
    actor_faction: FactionId = FactionId.ironCrown,
    target_region: str = "region-star",
    movement: str = "attack",
) -> MilitaryAction:
    return MilitaryAction(
        **_base_action_payload(action_id, actor_faction),
        visibility=_visibility(VisibilityScope.self, [actor_faction]),
        mode="military",
        source_region="region-iron",
        target_region=target_region,
        movement=movement,  # type: ignore[arg-type]
        orders_text="Advance.",
        troops=20,
    )


def _economy_event(
    faction_id: FactionId,
    *,
    turn: int,
    net_income: float,
) -> GameEvent:
    return GameEvent(
        id=f"economy-{faction_id}-{turn}",
        room_id="room-1",
        epoch=1,
        turn=turn,
        phase=GamePhase.resolve,
        created_at_ms=9_000 + turn,
        priority=EventPriority.P1,
        kind=EventKind.economy,
        actor_faction=faction_id,
        target_faction=None,
        payload={"faction_id": faction_id, "net_income": net_income},
        narration="Economic update.",
        visibility=_visibility(),
    )


def _input(
    *,
    factions: list[FactionState] | None = None,
    relationships: list[Relationship] | None = None,
    regions: list[MapRegion] | None = None,
    treaties: list[Treaty] | None = None,
    treaty_requests: list[TreatyAction] | None = None,
    military_orders: list[MilitaryAction] | None = None,
    recent_events: list[GameEvent] | None = None,
) -> SettlementInput:
    factions = factions or [
        _faction(FactionId.ironCrown),
        _faction(FactionId.starlight),
        _faction(FactionId.emerald),
        _faction(FactionId.ashen),
    ]
    relationships = relationships or [
        _relationship(FactionId.ironCrown, FactionId.starlight, 0.0),
        _relationship(FactionId.starlight, FactionId.ironCrown, 0.0),
    ]
    regions = regions or [
        _region("region-iron", FactionId.ironCrown),
        _region("region-star", FactionId.starlight),
        _region("region-emerald", FactionId.emerald),
        _region("region-ashen", FactionId.ashen),
    ]
    treaty_requests = treaty_requests or []
    military_orders = military_orders or []
    turn_actions: list[GameAction] = [*treaty_requests, *military_orders]
    return SettlementInput(
        room_id="room-1",
        epoch=1,
        turn=2,
        generated_at_ms=12_345,
        factions_snapshot=factions,
        relationships_snapshot=relationships,
        regions_snapshot=regions,
        treaties_snapshot=treaties or [],
        turn_actions=turn_actions,
        public_speeches=[],
        private_messages=[],
        treaty_requests=treaty_requests,
        military_orders=military_orders,
        intel_actions=[],
        recent_events=recent_events or [],
        faction_personality_summary={},
        relationship_summary_text="",
        faction_stats_summary_text="",
    )


def test_relationship_delta_out_of_bounds_is_clamped_to_single_turn_limit() -> None:
    model_output = llm_schema.SettlementModelOutput.model_construct(
        relationship_deltas=[
            llm_schema.RelationshipDelta.model_construct(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                delta=50.0,
                reason="oversized model suggestion",
            )
        ],
        treaty_decisions=[],
        military_judgements=[],
        culture_impacts=[],
        morale_impacts=[],
        narrative_events=[],
        map_change_suggestions=[],
        stat_change_suggestions=[],
        ai_speeches=[],
    )

    result = RuleResolver().apply_relationship_deltas(_input(), model_output)

    forward = next(
        delta
        for delta in result
        if delta.from_faction == FactionId.ironCrown and delta.to_faction == FactionId.starlight
    )
    assert forward.delta == 30.0


def test_relationship_final_value_is_clamped_to_100() -> None:
    settlement_input = _input(
        relationships=[
            _relationship(FactionId.ironCrown, FactionId.starlight, 90.0),
            _relationship(FactionId.starlight, FactionId.ironCrown, 90.0),
        ]
    )
    model_output = llm_schema.SettlementModelOutput(
        relationship_deltas=[
            llm_schema.RelationshipDelta(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                delta=30.0,
                reason="successful pact",
            )
        ]
    )

    result = RuleResolver().apply_relationship_deltas(settlement_input, model_output)

    forward = next(
        delta
        for delta in result
        if delta.from_faction == FactionId.ironCrown and delta.to_faction == FactionId.starlight
    )
    assert forward.delta == 10.0


def test_treaty_fallback_decision_is_used_when_model_omits_decision() -> None:
    treaty_request = _treaty_action()

    result = RuleResolver().resolve_treaties(
        _input(treaty_requests=[treaty_request]),
        llm_schema.SettlementModelOutput(),
    )

    assert len(result) == 1
    assert result[0].treaty_id == treaty_request.id
    assert "Fallback treaty score" in result[0].reason


def test_fortress_terrain_significantly_increases_defense() -> None:
    attacker = _faction(FactionId.ironCrown, military=100.0, morale=1.0)
    defender = _faction(FactionId.starlight, military=100.0, morale=1.0)
    plains = _region("plains", FactionId.starlight, terrain=TerrainKind.plains)
    fortress = _region("fortress", FactionId.starlight, terrain=TerrainKind.fortress)
    settlement_input = _input(factions=[attacker, defender])

    plains_result = RuleResolver(deterministic_rng_seed=7)._compute_battle(
        attacker,
        defender,
        plains,
        settlement_input,
    )
    fortress_result = RuleResolver(deterministic_rng_seed=7)._compute_battle(
        attacker,
        defender,
        fortress,
        settlement_input,
    )

    assert fortress_result.atk_loss > plains_result.atk_loss
    assert fortress_result.def_loss < plains_result.def_loss


def test_multi_front_war_penalty_uses_065_for_three_active_wars() -> None:
    settlement_input = _input(
        military_orders=[
            _military_action("attack-star", target_region="region-star"),
            _military_action("attack-emerald", target_region="region-emerald"),
            _military_action("attack-ashen", target_region="region-ashen"),
        ]
    )

    resolver = RuleResolver(deterministic_rng_seed=1)

    assert resolver._war_penalty(FactionId.ironCrown, settlement_input) == 0.65


def test_territory_capture_requires_defender_remaining_below_min_garrison() -> None:
    attacker = _faction(FactionId.ironCrown, military=300.0, morale=1.0)
    defender = _faction(FactionId.starlight, military=10.0, morale=1.0)
    settlement_input = _input(factions=[attacker, defender])

    captured = RuleResolver(deterministic_rng_seed=2)._compute_battle(
        attacker,
        defender,
        _region("high-garrison", FactionId.starlight, min_garrison=9),
        settlement_input,
    )
    held = RuleResolver(deterministic_rng_seed=2)._compute_battle(
        attacker,
        defender,
        _region("low-garrison", FactionId.starlight, min_garrison=1),
        settlement_input,
    )

    assert captured.territory_captured is True
    assert held.territory_captured is False


def test_morale_impact_is_clamped_to_allowed_bounds() -> None:
    settlement_input = _input(
        factions=[
            _faction(FactionId.ironCrown, morale=0.35),
            _faction(FactionId.starlight, morale=1.7),
        ]
    )
    model_output = llm_schema.SettlementModelOutput(
        morale_impacts=[
            llm_schema.MoraleImpact(
                faction_id=FactionId.ironCrown,
                delta=-0.2,
                reason="rout",
            ),
            llm_schema.MoraleImpact(
                faction_id=FactionId.starlight,
                delta=0.2,
                reason="victory",
            ),
        ]
    )

    result = RuleResolver().resolve(settlement_input, model_output)
    by_faction = {change.faction_id: change for change in result.faction_stat_changes}

    assert by_faction[FactionId.ironCrown].resulting_morale == 0.3
    assert by_faction[FactionId.starlight].resulting_morale == 1.8


def test_economy_three_negative_income_turns_marks_crisis() -> None:
    settlement_input = _input(
        factions=[_faction(FactionId.ironCrown, military=1_000.0, economy=50.0)],
        regions=[_region("poor", FactionId.ironCrown, resource_value=1.0)],
        recent_events=[
            _economy_event(FactionId.ironCrown, turn=1, net_income=-10.0),
            _economy_event(FactionId.ironCrown, turn=0, net_income=-5.0),
        ],
    )

    result = RuleResolver().resolve(settlement_input, llm_schema.SettlementModelOutput())
    change = result.faction_stat_changes[0]

    assert change.crisis is True
    assert any(event.payload.get("crisis") is True for event in result.narration_events)


def test_assemble_settlement_result_returns_complete_result() -> None:
    treaty_request = _treaty_action()
    military_order = _military_action()
    settlement_input = _input(treaty_requests=[treaty_request], military_orders=[military_order])
    model_output = llm_schema.SettlementModelOutput(
        treaty_decisions=[
            llm_schema.TreatyDecision(
                treaty_id=treaty_request.id,
                accepted=True,
                reason="accepted by model",
            )
        ],
        ai_speeches=[
            llm_schema.AISpeechItem(
                faction_id=FactionId.starlight,
                kind="public",
                content="We accept.",
            )
        ],
        narrative_events=[
            llm_schema.NarrativeEvent(
                kind="alliance",
                actor=FactionId.ironCrown,
                target=FactionId.starlight,
                narration="A trade pact stabilizes the border.",
            )
        ],
    )

    result = RuleResolver(deterministic_rng_seed=3).resolve(settlement_input, model_output)

    assert isinstance(result, SettlementResult)
    assert result.relationship_deltas == []
    assert len(result.treaty_decisions) == 1
    assert len(result.created_treaties) == 1
    assert len(result.battle_results) == 1
    assert result.faction_stat_changes
    assert len(result.ai_speeches) == 1
    assert len(result.narration_events) == 1


def test_same_deterministic_seed_produces_same_resolve_result() -> None:
    settlement_input = _input(military_orders=[_military_action()])
    model_output = llm_schema.SettlementModelOutput(
        relationship_deltas=[
            llm_schema.RelationshipDelta(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                delta=12.0,
                reason="cooperation",
            )
        ]
    )

    first = RuleResolver(deterministic_rng_seed=99).resolve(settlement_input, model_output)
    second = RuleResolver(deterministic_rng_seed=99).resolve(settlement_input, model_output)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
