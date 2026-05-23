from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from random import Random
from typing import Any

from pydantic import BaseModel

from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    TerrainKind,
    TreatyKind,
    VisibilityScope,
)
from app.domain.factions import FACTION_META
from app.domain.models import (
    AISpeechItem,
    BattleEvent,
    FactionStatChange,
    FactionState,
    GameEvent,
    MapRegion,
    MessageVisibility,
    RegionChange,
    RelationshipDelta,
    SettlementResult,
    Treaty,
    TreatyDecision,
)
from app.game.settlement_aggregator import SettlementInput
from app.llm.output_schema import SettlementModelOutput

TERRAIN_MODIFIERS: dict[TerrainKind, dict[str, float]] = {
    TerrainKind.ocean: {"attack": 0.5, "defense": 0.8},
    TerrainKind.mountain: {"attack": 0.8, "defense": 1.4},
    TerrainKind.plains: {"attack": 1.0, "defense": 1.0},
    TerrainKind.forest: {"attack": 0.95, "defense": 1.1},
    TerrainKind.river: {"attack": 0.8, "defense": 1.0},
    TerrainKind.fortress: {"attack": 0.7, "defense": 1.6},
    TerrainKind.desert: {"attack": 0.9, "defense": 0.9},
    TerrainKind.tundra: {"attack": 0.85, "defense": 1.15},
}
WAR_PENALTY_TABLE: dict[int, float] = {
    1: 1.0,
    2: 0.85,
    3: 0.65,
}

_TOTAL_POWER_WEIGHTS = {
    "military": 0.35,
    "economy": 0.25,
    "diplomacy": 0.25,
    "culture": 0.15,
}


class BattleResultRecord(BaseModel):
    attacker: FactionId
    defender: FactionId
    region_id: str
    atk_loss: float
    def_loss: float
    territory_captured: bool
    morale_shift: float
    narrative: str
    attacker_remaining_troops: float
    defender_remaining_troops: float


@dataclass(frozen=True)
class _StepOutputs:
    relationship_deltas: list[RelationshipDelta]
    treaty_decisions: list[TreatyDecision]
    created_treaties: list[Treaty]
    battle_results: list[BattleResultRecord]
    region_changes: list[RegionChange]
    faction_stat_changes: list[FactionStatChange]
    narration_events: list[GameEvent]
    ai_speeches: list[AISpeechItem]


class RuleResolver:
    def __init__(self, *, deterministic_rng_seed: int | None = None) -> None:
        self.rng = Random(deterministic_rng_seed)
        self._created_treaties: list[Treaty] = []
        self._last_projected_factions: dict[FactionId, dict[str, float | bool]] = {}

    def resolve(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> SettlementResult:
        relationship_deltas = self.apply_relationship_deltas(input, model_output)
        treaty_decisions = self.resolve_treaties(input, model_output)
        battle_results = self.resolve_military_orders(input, model_output)
        stat_changes = [
            *self._battle_stat_changes(battle_results),
            *self.apply_culture_impact(input, model_output),
            *self.apply_morale_impact(input, model_output),
            *self.apply_economy_changes(input, model_output),
            *self._model_stat_changes(model_output),
        ]
        bounded_stat_changes = self.enforce_bounds(input, stat_changes)
        region_changes = self.apply_map_changes(input, model_output, battle_results)
        step_outputs = _StepOutputs(
            relationship_deltas=relationship_deltas,
            treaty_decisions=treaty_decisions,
            created_treaties=list(self._created_treaties),
            battle_results=battle_results,
            region_changes=region_changes,
            faction_stat_changes=bounded_stat_changes,
            narration_events=self._narration_events(input, model_output, bounded_stat_changes),
            ai_speeches=self._ai_speeches(model_output),
        )
        return self.assemble_settlement_result(input, step_outputs)

    def apply_relationship_deltas(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[RelationshipDelta]:
        current = {
            (rel.from_faction, rel.to_faction): rel.value
            for rel in input.relationships_snapshot
        }
        proposed: dict[tuple[FactionId, FactionId], float] = defaultdict(float)
        reasons: dict[tuple[FactionId, FactionId], list[str]] = defaultdict(list)

        for delta in model_output.relationship_deltas:
            key = (delta.from_faction, delta.to_faction)
            proposed[key] += _clamp(delta.delta, -30.0, 30.0)
            reasons[key].append(delta.reason)

        normalized: dict[tuple[FactionId, FactionId], float] = {}
        for key, delta in proposed.items():
            normalized[key] = _clamp(delta, -30.0, 30.0)

        for from_faction, to_faction in list(normalized):
            reverse = (to_faction, from_faction)
            forward_current = current.get((from_faction, to_faction), 0.0)
            forward_final = _clamp(
                forward_current + normalized[(from_faction, to_faction)],
                -100.0,
                100.0,
            )
            reverse_current = current.get(reverse, forward_current)

            if reverse not in normalized:
                reverse_delta = _clamp(forward_final - reverse_current, -30.0, 30.0)
                normalized[reverse] = reverse_delta
                reasons[reverse].append("Mirrored relationship adjustment.")
                continue

            reverse_final = _clamp(reverse_current + normalized[reverse], -100.0, 100.0)
            if abs(forward_final - reverse_final) > 5.0:
                if reverse_final < forward_final:
                    target = forward_final - 5.0
                else:
                    target = forward_final + 5.0
                normalized[reverse] = _clamp(target - reverse_current, -30.0, 30.0)

        results: list[RelationshipDelta] = []
        for key in sorted(normalized, key=lambda item: (str(item[0]), str(item[1]))):
            from_faction, to_faction = key
            before = current.get(key, 0.0)
            final = _clamp(before + normalized[key], -100.0, 100.0)
            applied_delta = _clamp(final - before, -30.0, 30.0)
            results.append(
                RelationshipDelta(
                    from_faction=from_faction,
                    to_faction=to_faction,
                    delta=round(applied_delta, 4),
                    reason="; ".join(reasons.get(key) or ["Model relationship adjustment."]),
                )
            )
        return results

    def resolve_treaties(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[TreatyDecision]:
        decisions_by_id = {
            decision.treaty_id: decision
            for decision in model_output.treaty_decisions
        }
        decisions: list[TreatyDecision] = []
        self._created_treaties = []

        for request in input.treaty_requests:
            if request.id in decisions_by_id:
                model_decision = decisions_by_id[request.id]
                decision = TreatyDecision(
                    treaty_id=model_decision.treaty_id,
                    accepted=model_decision.accepted,
                    reason=model_decision.reason,
                    counter_proposal=model_decision.counter_proposal,
                )
            else:
                decision = self._fallback_treaty_decision(input, request)

            decisions.append(decision)
            if decision.accepted:
                self._created_treaties.append(self._create_treaty(input, request))

        return decisions

    def resolve_military_orders(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[BattleResultRecord]:
        del model_output
        factions = {faction.id: faction for faction in input.factions_snapshot}
        regions = {region.id: region for region in input.regions_snapshot}
        results: list[BattleResultRecord] = []

        for order in input.military_orders:
            if order.movement != "attack":
                continue

            attacker = factions.get(order.actor_faction)
            region = regions.get(order.target_region)
            if attacker is None or region is None or region.owner is None:
                continue

            defender = factions.get(region.owner)
            if defender is None or defender.id == attacker.id:
                continue

            results.append(self._compute_battle(attacker, defender, region, input))

        return results

    def _compute_battle(
        self,
        attacker_faction: FactionState,
        defender_faction: FactionState,
        region: MapRegion,
        input: SettlementInput,
    ) -> BattleResultRecord:
        terrain = TERRAIN_MODIFIERS.get(region.terrain, TERRAIN_MODIFIERS[TerrainKind.plains])
        war_penalty = self._war_penalty(attacker_faction.id, input)

        atk_power = attacker_faction.military * attacker_faction.morale
        atk_power *= terrain["attack"] * war_penalty
        def_power = defender_faction.military * defender_faction.morale * 1.3
        def_power *= terrain["defense"]

        denominator = atk_power + def_power
        base_ratio = 0.5 if denominator <= 0 else atk_power / denominator
        atk_ratio = _clamp(base_ratio * self.rng.uniform(0.9, 1.1), 0.1, 0.9)

        atk_loss = attacker_faction.military * (1.0 - atk_ratio) * 0.3
        def_loss = defender_faction.military * atk_ratio * 0.3
        attacker_remaining = max(0.0, attacker_faction.military - atk_loss)
        defender_remaining = max(0.0, defender_faction.military - def_loss)
        territory_captured = defender_remaining < float(region.min_garrison)
        morale_shift = (atk_ratio - 0.5) * 0.2

        return BattleResultRecord(
            attacker=attacker_faction.id,
            defender=defender_faction.id,
            region_id=region.id,
            atk_loss=round(atk_loss, 4),
            def_loss=round(def_loss, 4),
            territory_captured=territory_captured,
            morale_shift=round(morale_shift, 4),
            narrative=(
                f"{attacker_faction.id} attacked {defender_faction.id} in {region.id}; "
                f"terrain={region.terrain}, war_penalty={war_penalty:.2f}."
            ),
            attacker_remaining_troops=round(attacker_remaining, 4),
            defender_remaining_troops=round(defender_remaining, 4),
        )

    def apply_culture_impact(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[FactionStatChange]:
        known_factions = {faction.id for faction in input.factions_snapshot}
        changes: list[FactionStatChange] = []
        for impact in model_output.culture_impacts:
            if impact.faction_id not in known_factions:
                continue
            changes.append(
                FactionStatChange(
                    faction_id=impact.faction_id,
                    military_delta=0.0,
                    economy_delta=0.0,
                    diplomacy_delta=0.0,
                    culture_delta=round(_clamp(impact.delta, -20.0, 20.0), 4),
                    morale_delta=0.0,
                    reason=impact.reason,
                )
            )
        return changes

    def apply_morale_impact(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[FactionStatChange]:
        factions = {faction.id: faction for faction in input.factions_snapshot}
        changes: list[FactionStatChange] = []
        for impact in model_output.morale_impacts:
            faction = factions.get(impact.faction_id)
            if faction is None:
                continue
            target = _clamp(faction.morale + impact.delta, 0.3, 1.8)
            changes.append(
                FactionStatChange(
                    faction_id=impact.faction_id,
                    military_delta=0.0,
                    economy_delta=0.0,
                    diplomacy_delta=0.0,
                    culture_delta=0.0,
                    morale_delta=round(target - faction.morale, 4),
                    reason=impact.reason,
                )
            )
        return changes

    def apply_economy_changes(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
    ) -> list[FactionStatChange]:
        del model_output
        changes: list[FactionStatChange] = []
        for faction in input.factions_snapshot:
            active_wars = self._active_war_count(faction.id, input)
            trade_income = self._trade_income(faction.id, input)
            region_income = self._region_income(faction.id, input)
            maintenance_cost = faction.military * 0.08
            war_cost = active_wars * 5.0 + self._attack_order_count(faction.id, input) * 3.0
            net_income = region_income + trade_income - maintenance_cost - war_cost
            crisis = net_income < 0.0 and self._negative_income_streak(faction.id, input) >= 3

            changes.append(
                FactionStatChange(
                    faction_id=faction.id,
                    military_delta=0.0,
                    economy_delta=round(net_income, 4),
                    diplomacy_delta=0.0,
                    culture_delta=0.0,
                    morale_delta=-0.05 if crisis else 0.0,
                    crisis=crisis,
                    reason=(
                        "economy: "
                        f"region={region_income:.2f}, trade={trade_income:.2f}, "
                        f"maintenance={maintenance_cost:.2f}, war={war_cost:.2f}"
                    ),
                )
            )
        return changes

    def apply_map_changes(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
        battle_results: list[BattleResultRecord],
    ) -> list[RegionChange]:
        regions = {region.id: region for region in input.regions_snapshot}
        factions = {faction.id: faction for faction in input.factions_snapshot}
        changes_by_region: dict[str, RegionChange] = {}

        for battle in battle_results:
            if not battle.territory_captured:
                continue
            region = regions.get(battle.region_id)
            if region is None:
                continue
            changes_by_region[battle.region_id] = RegionChange(
                region_id=battle.region_id,
                prev_owner=region.owner,
                new_owner=battle.attacker,
                transition="conquest",
                animation_params=self._derive_animation_params(
                    input,
                    source_faction=battle.attacker,
                    target_faction=region.owner,
                    transition="conquest",
                ),
            )

        for suggestion in model_output.map_change_suggestions:
            if suggestion.region_id in changes_by_region:
                continue
            region = regions.get(suggestion.region_id)
            if region is None or suggestion.new_owner is None or region.owner is None:
                continue
            attacker = factions.get(suggestion.new_owner)
            defender = factions.get(region.owner)
            if attacker is None or defender is None:
                continue
            if attacker.military > defender.military * 1.2:
                changes_by_region[suggestion.region_id] = RegionChange(
                    region_id=suggestion.region_id,
                    prev_owner=region.owner,
                    new_owner=suggestion.new_owner,
                    transition="negotiated",
                    animation_params=self._derive_animation_params(
                        input,
                        source_faction=suggestion.new_owner,
                        target_faction=region.owner,
                        transition="negotiated",
                    ),
                )

        return list(changes_by_region.values())

    def _derive_animation_params(
        self,
        input: SettlementInput,
        *,
        source_faction: FactionId,
        target_faction: FactionId | None,
        transition: str,
    ) -> dict[str, Any]:
        source = _faction_anchor(input.regions_snapshot, source_faction) or (0.0, 0.0)
        target = _faction_anchor(input.regions_snapshot, target_faction) if target_faction else None

        if target is None:
            target = source

        lat_delta = target[0] - source[0]
        lng_delta = target[1] - source[1]
        if abs(lat_delta) >= abs(lng_delta):
            direction = "south_to_north" if lat_delta >= 0 else "north_to_south"
        else:
            direction = "west_to_east" if lng_delta >= 0 else "east_to_west"

        distance = min(180.0, abs(lat_delta) + abs(lng_delta))
        return {
            "direction": direction,
            "speed": round(_clamp(1.0 + distance / 360.0, 1.0, 1.5), 4),
            "particles": "aggressive" if transition == "conquest" else "neutral",
        }

    def enforce_bounds(
        self,
        input: SettlementInput,
        stats: list[FactionStatChange],
    ) -> list[FactionStatChange]:
        current = {faction.id: faction for faction in input.factions_snapshot}
        grouped: dict[FactionId, list[FactionStatChange]] = defaultdict(list)
        for change in stats:
            if change.faction_id in current:
                grouped[change.faction_id].append(change)

        bounded: list[FactionStatChange] = []
        self._last_projected_factions = {}
        for faction_id, changes in grouped.items():
            faction = current[faction_id]
            military_delta = sum(change.military_delta for change in changes)
            economy_delta = sum(change.economy_delta for change in changes)
            diplomacy_delta = sum(change.diplomacy_delta for change in changes)
            culture_delta = sum(change.culture_delta for change in changes)
            morale_delta = sum(change.morale_delta for change in changes)

            resulting_military = max(0.0, faction.military + military_delta)
            resulting_economy = max(0.0, faction.economy + economy_delta)
            resulting_diplomacy = max(0.0, faction.diplomacy + diplomacy_delta)
            resulting_culture = max(0.0, faction.culture + culture_delta)
            resulting_morale = _clamp(faction.morale + morale_delta, 0.3, 1.8)
            resulting_total_power = _total_power(
                military=resulting_military,
                economy=resulting_economy,
                diplomacy=resulting_diplomacy,
                culture=resulting_culture,
            )
            crisis = any(change.crisis for change in changes)
            reasons = [change.reason for change in changes if change.reason]

            self._last_projected_factions[faction_id] = {
                "military": resulting_military,
                "economy": resulting_economy,
                "diplomacy": resulting_diplomacy,
                "culture": resulting_culture,
                "morale": resulting_morale,
                "total_power": resulting_total_power,
                "crisis": crisis,
            }
            bounded.append(
                FactionStatChange(
                    faction_id=faction_id,
                    military_delta=round(resulting_military - faction.military, 4),
                    economy_delta=round(resulting_economy - faction.economy, 4),
                    diplomacy_delta=round(resulting_diplomacy - faction.diplomacy, 4),
                    culture_delta=round(resulting_culture - faction.culture, 4),
                    morale_delta=round(resulting_morale - faction.morale, 4),
                    resulting_military=round(resulting_military, 4),
                    resulting_economy=round(resulting_economy, 4),
                    resulting_diplomacy=round(resulting_diplomacy, 4),
                    resulting_culture=round(resulting_culture, 4),
                    resulting_morale=round(resulting_morale, 4),
                    resulting_total_power=resulting_total_power,
                    crisis=crisis,
                    reason="; ".join(reasons) if reasons else None,
                )
            )
        return sorted(bounded, key=lambda change: str(change.faction_id))

    def assemble_settlement_result(
        self,
        input: SettlementInput,
        all_step_outputs: _StepOutputs,
    ) -> SettlementResult:
        return SettlementResult(
            room_id=input.room_id,
            epoch=input.epoch,
            turn=input.turn,
            generated_at_ms=input.generated_at_ms,
            relationship_deltas=all_step_outputs.relationship_deltas,
            treaty_decisions=all_step_outputs.treaty_decisions,
            created_treaties=all_step_outputs.created_treaties,
            battle_results=[
                self._battle_event(input, index, record)
                for index, record in enumerate(all_step_outputs.battle_results)
            ],
            region_changes=all_step_outputs.region_changes,
            faction_stat_changes=all_step_outputs.faction_stat_changes,
            narration_events=all_step_outputs.narration_events,
            ai_speeches=all_step_outputs.ai_speeches,
        )

    def _fallback_treaty_decision(self, input: SettlementInput, request: Any) -> TreatyDecision:
        relationship_values = [
            self._relationship_value(input, request.actor_faction, target)
            for target in request.target_factions
        ]
        relationship_score = sum(relationship_values) / max(1, len(relationship_values))
        target_meta = [FACTION_META[target].personality for target in request.target_factions]
        trust_base = _average(meta["trust_base"] for meta in target_meta)
        interest_alignment = _average(meta["alliance_tendency"] for meta in target_meta)
        interest_conflict = _average(meta["aggression"] for meta in target_meta)
        score = relationship_score + trust_base * 40.0 + interest_alignment * 20.0
        score -= interest_conflict * 20.0
        threshold = self._treaty_threshold(request.treaty_kind)
        accepted = score >= threshold
        counter = None if accepted else "Reduce obligations or offer stronger guarantees."
        return TreatyDecision(
            treaty_id=request.id,
            accepted=accepted,
            reason=f"Fallback treaty score {score:.1f} against threshold {threshold:.1f}.",
            counter_proposal=counter,
        )

    def _create_treaty(self, input: SettlementInput, request: Any) -> Treaty:
        return Treaty(
            id=f"treaty:{input.room_id}:{input.epoch}:{input.turn}:{request.id}",
            kind=request.treaty_kind,
            parties=[request.actor_faction, *request.target_factions],
            started_epoch=input.epoch,
            started_turn=input.turn,
            ends_epoch=None,
            ends_turn=None,
            active=True,
            metadata={"proposal_text": request.proposal_text, "source_action_id": request.id},
        )

    def _battle_stat_changes(
        self,
        battle_results: list[BattleResultRecord],
    ) -> list[FactionStatChange]:
        changes: list[FactionStatChange] = []
        for battle in battle_results:
            changes.append(
                FactionStatChange(
                    faction_id=battle.attacker,
                    military_delta=-battle.atk_loss,
                    economy_delta=0.0,
                    diplomacy_delta=0.0,
                    culture_delta=0.0,
                    morale_delta=battle.morale_shift,
                    reason=f"battle:{battle.region_id}:attacker",
                )
            )
            changes.append(
                FactionStatChange(
                    faction_id=battle.defender,
                    military_delta=-battle.def_loss,
                    economy_delta=0.0,
                    diplomacy_delta=0.0,
                    culture_delta=0.0,
                    morale_delta=-battle.morale_shift,
                    reason=f"battle:{battle.region_id}:defender",
                )
            )
        return changes

    def _model_stat_changes(
        self,
        model_output: SettlementModelOutput,
    ) -> list[FactionStatChange]:
        return [
            FactionStatChange(
                faction_id=change.faction_id,
                military_delta=change.military_delta,
                economy_delta=change.economy_delta,
                diplomacy_delta=change.diplomacy_delta,
                culture_delta=change.culture_delta,
                morale_delta=change.morale_delta,
                reason="model stat suggestion",
            )
            for change in model_output.stat_change_suggestions
        ]

    def _narration_events(
        self,
        input: SettlementInput,
        model_output: SettlementModelOutput,
        stat_changes: list[FactionStatChange],
    ) -> list[GameEvent]:
        events: list[GameEvent] = []
        for index, event in enumerate(model_output.narrative_events):
            events.append(
                GameEvent(
                    id=f"settlement:{input.room_id}:{input.epoch}:{input.turn}:narration:{index}",
                    room_id=input.room_id,
                    epoch=input.epoch,
                    turn=input.turn,
                    phase=GamePhase.resolve,
                    created_at_ms=input.generated_at_ms,
                    priority=EventPriority.P1,
                    kind=_event_kind_for_narrative(event.kind),
                    actor_faction=event.actor,
                    target_faction=event.target,
                    payload={"source": "model", "kind": event.kind},
                    narration=event.narration,
                    visibility=MessageVisibility(scope=VisibilityScope.public),
                )
            )

        for change in stat_changes:
            if not change.crisis:
                continue
            events.append(
                GameEvent(
                    id=(
                        f"settlement:{input.room_id}:{input.epoch}:{input.turn}:"
                        f"economy-crisis:{change.faction_id}"
                    ),
                    room_id=input.room_id,
                    epoch=input.epoch,
                    turn=input.turn,
                    phase=GamePhase.resolve,
                    created_at_ms=input.generated_at_ms,
                    priority=EventPriority.P1,
                    kind=EventKind.economy,
                    actor_faction=change.faction_id,
                    target_faction=None,
                    payload={"crisis": True, "net_income": change.economy_delta},
                    narration=f"{change.faction_id} enters economic crisis after sustained losses.",
                    visibility=MessageVisibility(scope=VisibilityScope.public),
                )
            )
        return events

    def _ai_speeches(self, model_output: SettlementModelOutput) -> list[AISpeechItem]:
        return [
            AISpeechItem(
                faction_id=speech.faction_id,
                kind=speech.kind,
                content=speech.content,
                target_faction=speech.target_faction,
            )
            for speech in model_output.ai_speeches
        ]

    def _battle_event(
        self,
        input: SettlementInput,
        index: int,
        record: BattleResultRecord,
    ) -> BattleEvent:
        return BattleEvent(
            id=f"settlement:{input.room_id}:{input.epoch}:{input.turn}:battle:{index}",
            room_id=input.room_id,
            epoch=input.epoch,
            turn=input.turn,
            phase=GamePhase.resolve,
            created_at_ms=input.generated_at_ms,
            priority=EventPriority.P0,
            kind=EventKind.battle,
            actor_faction=record.attacker,
            target_faction=record.defender,
            payload={
                "region_id": record.region_id,
                "atk_loss": record.atk_loss,
                "def_loss": record.def_loss,
                "territory_captured": record.territory_captured,
                "morale_shift": record.morale_shift,
                "narrative": record.narrative,
                "attacker_remaining_troops": record.attacker_remaining_troops,
                "defender_remaining_troops": record.defender_remaining_troops,
            },
            narration=record.narrative,
            visibility=MessageVisibility(scope=VisibilityScope.public),
            attacker=record.attacker,
            defender=record.defender,
            region_id=record.region_id,
            atk_loss=record.atk_loss,
            def_loss=record.def_loss,
            territory_captured=record.territory_captured,
            morale_shift=record.morale_shift,
            attacker_remaining_troops=record.attacker_remaining_troops,
            defender_remaining_troops=record.defender_remaining_troops,
        )

    def _war_penalty(self, faction_id: FactionId, input: SettlementInput) -> float:
        active_wars = self._active_war_count(faction_id, input)
        if active_wars <= 0:
            active_wars = 1
        return WAR_PENALTY_TABLE.get(active_wars, 0.45)

    def _active_war_count(self, faction_id: FactionId, input: SettlementInput) -> int:
        opponents: set[FactionId] = set()
        owner_by_region = {region.id: region.owner for region in input.regions_snapshot}
        for order in input.military_orders:
            if order.movement != "attack" or order.actor_faction != faction_id:
                continue
            defender = owner_by_region.get(order.target_region)
            if defender is not None and defender != faction_id:
                opponents.add(defender)

        for event in input.recent_events:
            if event.kind not in {EventKind.battle, EventKind.declare_war}:
                continue
            if event.actor_faction == faction_id and event.target_faction is not None:
                opponents.add(event.target_faction)
            elif event.target_faction == faction_id and event.actor_faction is not None:
                opponents.add(event.actor_faction)

        return max(1, len(opponents))

    def _attack_order_count(self, faction_id: FactionId, input: SettlementInput) -> int:
        return sum(
            1
            for order in input.military_orders
            if order.actor_faction == faction_id and order.movement == "attack"
        )

    def _trade_income(self, faction_id: FactionId, input: SettlementInput) -> float:
        active_trade_count = sum(
            1
            for treaty in input.treaties_snapshot
            if treaty.active and treaty.kind == TreatyKind.trade and faction_id in treaty.parties
        )
        created_trade_count = sum(
            1
            for treaty in self._created_treaties
            if treaty.kind == TreatyKind.trade and faction_id in treaty.parties
        )
        return (active_trade_count + created_trade_count) * 5.0

    def _region_income(self, faction_id: FactionId, input: SettlementInput) -> float:
        return sum(
            region.resource_value * region.development_level * 0.05
            for region in input.regions_snapshot
            if region.owner == faction_id
        )

    def _negative_income_streak(self, faction_id: FactionId, input: SettlementInput) -> int:
        streak = 1
        previous = [
            event
            for event in input.recent_events
            if event.kind == EventKind.economy
            and event.payload.get("faction_id") == faction_id
            and "net_income" in event.payload
        ]
        previous.sort(
            key=lambda event: (event.epoch, event.turn, event.created_at_ms),
            reverse=True,
        )
        for event in previous:
            if float(event.payload["net_income"]) >= 0.0:
                break
            streak += 1
        return streak

    def _relationship_value(
        self,
        input: SettlementInput,
        from_faction: FactionId,
        to_faction: FactionId,
    ) -> float:
        for relationship in input.relationships_snapshot:
            if relationship.from_faction == from_faction and relationship.to_faction == to_faction:
                return relationship.value
        return 0.0

    def _treaty_threshold(self, treaty_kind: TreatyKind) -> float:
        if treaty_kind == TreatyKind.trade:
            return 25.0
        if treaty_kind == TreatyKind.ceasefire:
            return 15.0
        if treaty_kind == TreatyKind.non_aggression:
            return 30.0
        return 45.0


def resolve_rules(
    input: SettlementInput,
    model_output: SettlementModelOutput,
) -> SettlementResult:
    return RuleResolver().resolve(input, model_output)


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _faction_anchor(
    regions: list[MapRegion],
    faction_id: FactionId | None,
) -> tuple[float, float] | None:
    owned = [region for region in regions if region.owner == faction_id]
    if not owned:
        return None

    primary = sorted(
        owned,
        key=lambda region: (
            -region.development_level,
            -region.resource_value,
            region.id,
        ),
    )[0]
    return primary.center_lat_lng


def _average(values: Any) -> float:
    items = list(values)
    if not items:
        return 0.0
    return sum(items) / len(items)


def _total_power(
    *,
    military: float,
    economy: float,
    diplomacy: float,
    culture: float,
) -> float:
    return round(
        military * _TOTAL_POWER_WEIGHTS["military"]
        + economy * _TOTAL_POWER_WEIGHTS["economy"]
        + diplomacy * _TOTAL_POWER_WEIGHTS["diplomacy"]
        + culture * _TOTAL_POWER_WEIGHTS["culture"],
        4,
    )


def _event_kind_for_narrative(kind: str) -> EventKind:
    if kind == "betrayal":
        return EventKind.betrayal
    if kind == "alliance":
        return EventKind.alliance
    if kind == "declare_war":
        return EventKind.declare_war
    if kind == "intel_leak":
        return EventKind.intel
    return EventKind.narration
