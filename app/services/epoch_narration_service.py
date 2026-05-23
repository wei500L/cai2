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

    try:
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
    except Exception:
        return _fallback_epic_payload(epoch_state)


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

    try:
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
    except Exception:
        return _fallback_summary_payload(epoch_state)


def _fallback_epic_payload(epoch_state: EpochNarrationState) -> EpicNarrationPayload:
    top_rank = epoch_state.rankings[0] if epoch_state.rankings else None
    faction_name = _faction_name(top_rank.id if top_rank is not None else None)
    seed = f"{epoch_state.room_id}:{epoch_state.epoch}:{epoch_state.turn}:{faction_name}"
    selected = _pick_narration_templates(seed, count=5)
    narrative_parts = [
        template.format(faction_name=faction_name, epoch=epoch_state.epoch)
        for template in selected
    ]
    if epoch_state.key_events:
        narrative_parts.append(
            "本纪元的关键落点包括：" + "；".join(epoch_state.key_events[:4]) + "。"
        )
    narrative = _join_paragraphs(narrative_parts)
    narrative = _ensure_length(narrative, min_chars=200, max_chars=600, seed=seed, faction_name=faction_name, epoch=epoch_state.epoch)
    return EpicNarrationPayload(
        epoch=epoch_state.epoch,
        source="template_fallback",
        narrative=narrative,
        tone=epoch_state.tone,
        keyEvents=list(epoch_state.key_events[:6]) or [f"{faction_name} 收束纪元 {epoch_state.epoch}"],
        model=None,
        generatedAtMs=epoch_state.generated_at_ms,
    )


def _fallback_summary_payload(epoch_state: EpochNarrationState) -> SummaryNarrationPayload:
    top_rank = epoch_state.rankings[0] if epoch_state.rankings else None
    faction_name = _faction_name(top_rank.id if top_rank is not None else None)
    seed = f"{epoch_state.room_id}:{epoch_state.epoch}:{epoch_state.turn}:{len(epoch_state.key_events)}"
    headline_template = _pick_summary_headline(seed)
    headline = headline_template.format(faction_name=faction_name, epoch=epoch_state.epoch)
    highlights = epoch_state.highlights.model_copy(deep=True)
    if not highlights.majorEvents and epoch_state.key_events:
        highlights.majorEvents = [
            SummaryHighlightMajorEventPayload(
                id=f"fallback-major-{epoch_state.epoch}",
                kind="speech",
                turn=epoch_state.turn,
                priority="P1",
                actor=top_rank.id if top_rank is not None else None,
                target=None,
                narration=epoch_state.key_events[0],
            )
        ]
    if not highlights.wars and epoch_state.key_events:
        actor = top_rank.id if top_rank is not None else FactionId.ironCrown
        target = _next_faction(actor)
        highlights.wars = [
            SummaryHighlightBattlePayload(
                id=f"fallback-war-{epoch_state.epoch}",
                kind="battle",
                turn=epoch_state.turn,
                priority="P1",
                actor=actor,
                target=target,
                regionId="unknown",
                attackerLoss=0.0,
                defenderLoss=0.0,
                attackerRemainingTroops=0.0,
                defenderRemainingTroops=0.0,
                narration=epoch_state.key_events[0],
            )
        ]
    if not highlights.betrayals and len(epoch_state.key_events) > 1:
        actor = top_rank.id if top_rank is not None else FactionId.ironCrown
        target = _next_faction(actor)
        highlights.betrayals = [
            SummaryHighlightBetrayalPayload(
                id=f"fallback-betrayal-{epoch_state.epoch}",
                kind="betrayal",
                turn=epoch_state.turn,
                priority="P1",
                actor=actor,
                target=target,
                narration=epoch_state.key_events[1],
            )
        ]
    return SummaryNarrationPayload(
        epoch=epoch_state.epoch,
        source="template_fallback",
        headline=headline,
        highlights=highlights,
        rankings=list(epoch_state.rankings),
        model=None,
        generatedAtMs=epoch_state.generated_at_ms,
    )


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


def _pick_narration_templates(seed: str, *, count: int) -> list[str]:
    from app.data.narration_templates import pick_templates

    return pick_templates(_EPIC_TEMPLATE_POOL, seed=seed, count=count)


def _pick_summary_headline(seed: str) -> str:
    from app.data.narration_templates import pick_template

    return pick_template(_SUMMARY_HEADLINE_POOL, seed=seed)


def _join_paragraphs(parts: list[str]) -> str:
    text = "。".join(part.strip("。") for part in parts if part.strip())
    return text if text.endswith("。") else f"{text}。"


def _ensure_length(
    text: str,
    *,
    min_chars: int,
    max_chars: int,
    seed: str,
    faction_name: str,
    epoch: int,
) -> str:
    from app.data.narration_templates import pick_templates

    if len(text) < min_chars:
        extra = pick_templates(_EPIC_TEMPLATE_POOL, seed=f"{seed}:extra", count=2)
        for template in extra:
            text = _join_paragraphs(
                [
                    text,
                    template.format(faction_name=faction_name, epoch=epoch),
                ]
            )
            if len(text) >= min_chars:
                break
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip("。") + "。"
    return text


def _faction_name(faction_id: FactionId | None) -> str:
    if faction_id is None:
        return "诸势力"
    meta = FACTION_META.get(faction_id)
    return meta.name if meta is not None else str(faction_id)


def _next_faction(current: FactionId) -> FactionId:
    members = list(FactionId)
    index = members.index(current)
    return members[(index + 1) % len(members)]


_EPIC_TEMPLATE_POOL = [
    "纪元 {epoch} 的余烬在 {faction_name} 的边界上缓慢升温，旧有的默契被战鼓一点点敲松。",
    "{faction_name} 在纪元 {epoch} 里并未独占舞台，却始终站在权力重新分配的转折口。",
    "当纪元 {epoch} 逼近终点，{faction_name} 目睹盟约、试探与反制同时压向同一条战线。",
    "纪元 {epoch} 的风向变得锋利，{faction_name} 在喧哗与沉默之间重新丈量敌友。",
    "旧秩序在纪元 {epoch} 并未碎裂成粉末，而是被 {faction_name} 与诸方博弈磨出裂缝。",
    "纪元 {epoch} 的最后时刻，{faction_name} 的选择像钉子一样钉住了新的局势走向。",
    "战火、背约与公开宣言在纪元 {epoch} 交错，{faction_name} 被迫在多条战线上同时回应。",
    "{faction_name} 让纪元 {epoch} 的结尾更像一次缓慢燃烧的审判，而非轻巧的收束。",
    "纪元 {epoch} 结束时，{faction_name} 身后堆起的是胜利的碎片，也是下一轮冲突的引信。",
    "当纪元 {epoch} 收官，{faction_name} 没有完全赢下棋局，却足以让所有对手重新计算代价。",
]

_SUMMARY_HEADLINE_POOL = [
    "纪元 {epoch}：{faction_name} 把节奏重新握回手中",
    "纪元 {epoch}：{faction_name} 在乱局里压出新排序",
    "纪元 {epoch}：{faction_name} 让局势重新定价",
    "纪元 {epoch}：{faction_name} 站上新的权力刻度",
    "纪元 {epoch}：{faction_name} 把风暴推回对手身上",
    "纪元 {epoch}：{faction_name} 让旧盟约重新接受检验",
    "纪元 {epoch}：{faction_name} 为下一阶段铺出硬边界",
    "纪元 {epoch}：{faction_name} 把混乱压成可计算的局面",
    "纪元 {epoch}：{faction_name} 让各方都不敢轻易下注",
    "纪元 {epoch}：{faction_name} 在终局前抢下先手",
]
