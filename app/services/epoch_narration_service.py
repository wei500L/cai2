"""Epoch narration aggregation and generation."""
# ruff: noqa: RUF001, E501

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.clock import Clock
from app.domain.enums import EventKind, EventPriority, FactionId
from app.domain.factions import FACTION_META
from app.domain.models import FactionState, GameEvent, SettlementResult
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.client import LLMClient, LLMRequest
from app.llm.output_schema import EpicNarrationModelOutput, SummaryNarrationModelOutput
from app.llm.prompt_builder import PromptBuilder
from app.protocol.narration_events import (
    EpicNarrationPayload,
    SummaryHighlightBattlePayload,
    SummaryHighlightBetrayalPayload,
    SummaryHighlightBundlePayload,
    SummaryHighlightMajorEventPayload,
    SummaryNarrationPayload,
    SummaryRankingRowPayload,
)
from app.repositories.factory import Repositories

_PROMPT_BUILDER = PromptBuilder()
_TOTAL_POWER_WEIGHTS = {
    "military": 0.35,
    "economy": 0.25,
    "diplomacy": 0.25,
    "culture": 0.15,
}


class EpochNarrationState(BaseModel):
    model_config = ConfigDict(strict=True, arbitrary_types_allowed=True)

    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    faction_stats_summary_text: str
    tone: str
    key_events: list[str] = Field(default_factory=list)
    rankings: list[SummaryRankingRowPayload] = Field(default_factory=list)
    highlights: SummaryHighlightBundlePayload


class EpochNarrationBundle(BaseModel):
    model_config = ConfigDict(strict=True, arbitrary_types_allowed=True)

    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    seq_base: int
    epic_narration: EpicNarrationPayload
    summary_narration: SummaryNarrationPayload


async def build_epoch_narration_state(
    repos: Repositories,
    clock: Clock,
    room_id: str,
    epoch: int,
) -> EpochNarrationState:
    aggregator = SettlementAggregator(repos, clock)
    settlement_input = await aggregator.aggregate_epoch_summary(room_id, epoch)
    settlements = [
        result
        for result in await repos.settlements.list_by_room(room_id)
        if result.epoch == epoch
    ]
    epoch_events = await _load_epoch_events(repos, room_id, epoch)
    rankings = _build_rankings(settlement_input.factions_snapshot, settlements)
    highlights = _build_highlights(epoch_events)
    tone = _tone_from_state(rankings, highlights)
    key_events = _build_key_events(rankings, highlights, epoch_events)

    return EpochNarrationState(
        room_id=room_id,
        epoch=epoch,
        turn=settlement_input.turn,
        generated_at_ms=clock.now_ms(),
        faction_stats_summary_text=settlement_input.faction_stats_summary_text,
        tone=tone,
        key_events=key_events,
        rankings=rankings,
        highlights=highlights,
    )


async def generate_epic_narration(
    epoch_state: EpochNarrationState,
    llm: LLMClient,
) -> EpicNarrationPayload:
    prompt = _PROMPT_BUILDER.build_epic_narration_prompt(epoch_state)
    request = LLMRequest(
        system=prompt.system,
        user=prompt.user,
        temperature=prompt.temperature,
        max_tokens=prompt.max_tokens,
        metadata={
            "kind": "epic_narration",
            "room_id": epoch_state.room_id,
            "epoch": epoch_state.epoch,
            "epoch_state": epoch_state.model_dump(mode="json"),
        },
    )

    response = await llm.call_epic_narration(request)
    model_output = EpicNarrationModelOutput.model_validate_json(response.content)
    payload = EpicNarrationPayload(
        epoch=epoch_state.epoch,
        source="llm",
        narrative=model_output.narrative,
        tone=model_output.tone,
        keyEvents=list(model_output.key_events),
        model=response.model,
        generatedAtMs=epoch_state.generated_at_ms,
    )
    return payload


async def generate_summary_narration(
    epoch_state: EpochNarrationState,
    llm: LLMClient,
) -> SummaryNarrationPayload:
    prompt = _PROMPT_BUILDER.build_summary_narration_prompt(epoch_state)
    request = LLMRequest(
        system=prompt.system,
        user=prompt.user,
        temperature=prompt.temperature,
        max_tokens=prompt.max_tokens,
        metadata={
            "kind": "summary_narration",
            "room_id": epoch_state.room_id,
            "epoch": epoch_state.epoch,
            "epoch_state": epoch_state.model_dump(mode="json"),
        },
    )

    response = await llm.call_summary_narration(request)
    model_output = SummaryNarrationModelOutput.model_validate_json(response.content)
    payload = SummaryNarrationPayload.model_validate_json(
        json.dumps(
            {
                "epoch": epoch_state.epoch,
                "source": "llm",
                "headline": model_output.headline,
                "highlights": model_output.highlights.model_dump(mode="json"),
                "rankings": [row.model_dump(mode="json") for row in model_output.rankings],
                "model": response.model,
                "generatedAtMs": epoch_state.generated_at_ms,
            },
            ensure_ascii=False,
            default=str,
        )
    )
    return payload


def _build_rankings(
    factions_snapshot: list[FactionState],
    settlements: list[SettlementResult],
) -> list[SummaryRankingRowPayload]:
    current_power = {faction.id: faction.total_power for faction in factions_snapshot}
    previous_power = dict(current_power)
    delta_by_faction: dict[FactionId, float] = defaultdict(float)
    for settlement in settlements:
        for change in settlement.faction_stat_changes:
            delta_by_faction[change.faction_id] += _total_power_delta(change)

    for faction_id, delta in delta_by_faction.items():
        previous_power[faction_id] = round(current_power.get(faction_id, 0.0) - delta, 4)

    current_rank = _rank_by_power(current_power)
    previous_rank = _rank_by_power(previous_power)
    rows: list[SummaryRankingRowPayload] = []
    for faction_id in sorted(current_power, key=str):
        current = current_rank.get(faction_id, len(current_rank))
        previous = previous_rank.get(faction_id, len(previous_rank))
        rows.append(
            SummaryRankingRowPayload(
                id=faction_id,
                name=_faction_name(faction_id),
                totalPower=round(current_power[faction_id], 4),
                previousRank=previous,
                currentRank=current,
                rankDelta=previous - current,
                previousPower=round(previous_power.get(faction_id, current_power[faction_id]), 4),
            )
        )
    rows.sort(key=lambda item: item.currentRank)
    return rows


def _build_highlights(epoch_events: list[GameEvent]) -> SummaryHighlightBundlePayload:
    ordered_events = sorted(
        epoch_events,
        key=lambda event: (event.created_at_ms, event.turn, event.seq or 0, event.id),
    )

    major_events: list[SummaryHighlightMajorEventPayload] = []
    wars: list[SummaryHighlightBattlePayload] = []
    betrayals: list[SummaryHighlightBetrayalPayload] = []

    for event in ordered_events:
        if event.priority in {EventPriority.P0, EventPriority.P1}:
            major_events.append(_major_event_from_game_event(event))
        if event.kind == EventKind.battle:
            battle = _battle_highlight_from_game_event(event)
            if battle is not None:
                wars.append(battle)
        if event.kind == EventKind.betrayal:
            betrayal = _betrayal_highlight_from_game_event(event)
            if betrayal is not None:
                betrayals.append(betrayal)

    return SummaryHighlightBundlePayload(
        majorEvents=major_events[:5],
        wars=wars[:5],
        betrayals=betrayals[:5],
    )


def _build_key_events(
    rankings: list[SummaryRankingRowPayload],
    highlights: SummaryHighlightBundlePayload,
    epoch_events: list[GameEvent],
) -> list[str]:
    items: list[str] = []
    for row in rankings:
        if row.rankDelta != 0:
            items.append(
                f"{row.name} 排名 {row.previousRank} -> {row.currentRank}, "
                f"总权势 {row.previousPower:.1f} -> {row.totalPower:.1f}"
            )
        if len(items) >= 4:
            break

    for event in highlights.majorEvents:
        if len(items) >= 6:
            break
        items.append(event.narration)

    if len(items) < 6:
        for battle in highlights.wars:
            if len(items) >= 6:
                break
            items.append(battle.narration)

    if len(items) < 6:
        for betrayal in highlights.betrayals:
            if len(items) >= 6:
                break
            items.append(betrayal.narration)

    if not items:
        items = [event.narration for event in epoch_events[:3]]

    return items[:6]


def _tone_from_state(
    rankings: list[SummaryRankingRowPayload],
    highlights: SummaryHighlightBundlePayload,
) -> str:
    war_count = len(highlights.wars)
    betrayal_count = len(highlights.betrayals)
    rank_shift_count = sum(1 for row in rankings if row.rankDelta != 0)
    if war_count and betrayal_count:
        return "肃杀"
    if war_count >= 2 or rank_shift_count >= 4:
        return "激荡"
    if betrayal_count >= 2:
        return "阴郁"
    return "史诗"


def _major_event_from_game_event(event: GameEvent) -> SummaryHighlightMajorEventPayload:
    return SummaryHighlightMajorEventPayload(
        id=event.id,
        kind=event.kind.value,
        turn=event.turn,
        priority=event.priority.value,  # type: ignore[arg-type]
        actor=event.actor_faction,
        target=event.target_faction,
        narration=event.narration,
    )


def _battle_highlight_from_game_event(
    event: GameEvent,
) -> SummaryHighlightBattlePayload | None:
    payload = event.payload or {}
    attacker = getattr(event, "attacker", None) or event.actor_faction
    defender = getattr(event, "defender", None) or event.target_faction
    if attacker is None or defender is None:
        return None
    return SummaryHighlightBattlePayload(
        id=event.id,
        kind="battle",
        turn=event.turn,
        priority=event.priority.value,  # type: ignore[arg-type]
        actor=attacker,
        target=defender,
        regionId=str(payload.get("region_id") or getattr(event, "region_id", "")),
        attackerLoss=float(payload.get("atk_loss") or getattr(event, "atk_loss", 0.0) or 0.0),
        defenderLoss=float(payload.get("def_loss") or getattr(event, "def_loss", 0.0) or 0.0),
        attackerRemainingTroops=float(
            payload.get("attacker_remaining_troops")
            or getattr(event, "attacker_remaining_troops", 0.0)
            or 0.0
        ),
        defenderRemainingTroops=float(
            payload.get("defender_remaining_troops")
            or getattr(event, "defender_remaining_troops", 0.0)
            or 0.0
        ),
        narration=event.narration,
    )


def _betrayal_highlight_from_game_event(
    event: GameEvent,
) -> SummaryHighlightBetrayalPayload | None:
    actor = event.actor_faction
    target = event.target_faction
    if actor is None or target is None:
        return None
    return SummaryHighlightBetrayalPayload(
        id=event.id,
        kind="betrayal",
        turn=event.turn,
        priority=event.priority.value,  # type: ignore[arg-type]
        actor=actor,
        target=target,
        narration=event.narration,
    )


async def _load_epoch_events(
    repos: Repositories,
    room_id: str,
    epoch: int,
) -> list[GameEvent]:
    events = [event for event in await repos.events.list_all(room_id) if event.epoch == epoch]
    return sorted(events, key=lambda event: (event.created_at_ms, event.turn, event.seq or 0, event.id))


def _total_power_delta(change: Any) -> float:
    return round(
        float(change.military_delta) * _TOTAL_POWER_WEIGHTS["military"]
        + float(change.economy_delta) * _TOTAL_POWER_WEIGHTS["economy"]
        + float(change.diplomacy_delta) * _TOTAL_POWER_WEIGHTS["diplomacy"]
        + float(change.culture_delta) * _TOTAL_POWER_WEIGHTS["culture"],
        4,
    )


def _rank_by_power(values: dict[FactionId, float]) -> dict[FactionId, int]:
    ordered = sorted(values.items(), key=lambda item: (-item[1], str(item[0])))
    return {faction_id: index + 1 for index, (faction_id, _value) in enumerate(ordered)}


def _faction_name(faction_id: FactionId | None) -> str:
    if faction_id is None:
        return "诸势力"
    meta = FACTION_META.get(faction_id)
    return meta.name if meta is not None else str(faction_id)
