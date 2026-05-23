from __future__ import annotations

import hashlib
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import FactionId, TerrainKind
from app.domain.models import BattleEvent
from app.domain.world_geometry import WorldGeometry
from app.llm.client import LLMClient
from app.llm.explosion_prompt import build_explosion_judge_prompt, parse_explosion_prompt
from app.llm.output_schema import ExplosionJudgeOutput
from app.protocol.explosion_events import ExplosionPayload, ScorchedChange


class ExplosionAnalysis(BaseModel):
    model_config = ConfigDict(strict=True)

    center_hex_id: str
    kind: str
    hex_resource_values: dict[str, float] = Field(default_factory=dict)
    hex_owner_ids: dict[str, FactionId] = Field(default_factory=dict)
    ocean_hex_ids: list[str] = Field(default_factory=list)
    max_hops: int = 2


class ExplosionResolution(BaseModel):
    model_config = ConfigDict(strict=True)

    payload: ExplosionPayload
    scorched_diff: list[ScorchedChange]
    analysis: ExplosionAnalysis
    source: str = "fallback"
    judge_output: ExplosionJudgeOutput | None = None


async def resolve_explosion(
    event: BattleEvent,
    world_geometry: WorldGeometry | None,
    scorched_state: dict[str, Any] | list[Any],
    llm_client: LLMClient,
) -> ExplosionResolution:
    prompt = build_explosion_judge_prompt(event, world_geometry, scorched_state, event.turn)
    judge_output, source = await _judge_with_fallback(
        event,
        prompt,
        llm_client,
        world_geometry,
        scorched_state,
    )
    kind = _extract_kind_from_prompt(prompt)
    judge_output = _normalize_output_for_kind(judge_output, kind)
    analysis = _build_analysis(event, world_geometry, judge_output, prompt)
    payload = _build_payload(event, judge_output, analysis)
    return ExplosionResolution(
        payload=payload,
        scorched_diff=_predict_scorched_diff(event, judge_output, analysis, scorched_state),
        analysis=analysis,
        source=source,
        judge_output=judge_output,
    )


async def _judge_with_fallback(
    event: BattleEvent,
    prompt: str,
    llm_client: LLMClient,
    world_geometry: WorldGeometry | None,
    scorched_state: dict[str, Any] | list[Any],
) -> tuple[ExplosionJudgeOutput, str]:
    try:
        caller = getattr(llm_client, "call_explosion_judge", None)
        if caller is None:
            raise AttributeError("llm client missing call_explosion_judge")
        response = await caller(prompt)
        return ExplosionJudgeOutput.model_validate_json(response.content), "llm"
    except Exception:
        return _fallback_judge(event, world_geometry, scorched_state), "fallback"


def _fallback_judge(
    event: BattleEvent,
    world_geometry: WorldGeometry | None,
    scorched_state: dict[str, Any] | list[Any],
) -> ExplosionJudgeOutput:
    context = parse_explosion_prompt(
        build_explosion_judge_prompt(event, world_geometry, scorched_state, event.turn)
    )
    kind = str(context.get("kind") or "conventional")
    center_hex_id = str(context.get("center_hex_id") or "")
    candidates = [
        node["hex_id"]
        for node in context.get("subgraph", {}).get("nodes", [])
        if isinstance(node, dict)
    ]
    ordered = _ordered_candidates(center_hex_id, kind, candidates)
    affected = _select_affected(kind, center_hex_id, ordered)
    return ExplosionJudgeOutput(
        affected_hex_ids=affected,
        primary_hex_id=center_hex_id,
        scorched_turns=_fallback_turns(kind),
        fallout_severity=_fallback_fallout(kind),
        economic_loss_pct=_fallback_economic_loss(kind),
        narrative_hint=f"{kind} strike centered on {center_hex_id}",
    )


def _build_analysis(
    event: BattleEvent,
    world_geometry: WorldGeometry | None,
    judge_output: ExplosionJudgeOutput,
    prompt: str,
) -> ExplosionAnalysis:
    center_hex_id = judge_output.primary_hex_id
    kind = _extract_kind_from_prompt(prompt)
    hex_resource_values: dict[str, float] = {}
    hex_owner_ids: dict[str, FactionId] = {}
    ocean_hex_ids: list[str] = []
    if world_geometry is not None:
        cell_by_hex = {cell.hex_id: index for index, cell in enumerate(world_geometry.cells)}
        for hex_id in judge_output.affected_hex_ids:
            index = cell_by_hex.get(hex_id)
            if index is None:
                continue
            cell = world_geometry.cells[index]
            hex_owner_ids[hex_id] = cell.faction_id
            hex_resource_values[hex_id] = _resource_value_for_cell(world_geometry, index)
            if cell.terrain is TerrainKind.ocean:
                ocean_hex_ids.append(hex_id)

    return ExplosionAnalysis(
        center_hex_id=center_hex_id,
        kind=kind,
        hex_resource_values=hex_resource_values,
        hex_owner_ids=hex_owner_ids,
        ocean_hex_ids=ocean_hex_ids,
        max_hops=2,
    )


def _build_payload(
    event: BattleEvent,
    judge_output: ExplosionJudgeOutput,
    analysis: ExplosionAnalysis,
) -> ExplosionPayload:
    kind = _canonical_kind(analysis.kind)
    return ExplosionPayload(
        room_id=event.room_id,
        epoch=event.epoch,
        turn=event.turn,
        event_id=event.id,
        source_region_id=event.region_id,
        kind=kind,
        primary_hex_id=judge_output.primary_hex_id,
        affected_hex_ids=judge_output.affected_hex_ids,
        scorched_turns=judge_output.scorched_turns,
        fallout_severity=judge_output.fallout_severity,
        economic_loss_pct=judge_output.economic_loss_pct,
        narrative_hint=judge_output.narrative_hint,
    )


def _predict_scorched_diff(
    event: BattleEvent,
    judge_output: ExplosionJudgeOutput,
    analysis: ExplosionAnalysis,
    scorched_state: dict[str, Any] | list[Any],
) -> list[ScorchedChange]:
    current = _state_to_map(scorched_state)
    changes: list[ScorchedChange] = []
    for hex_id in judge_output.affected_hex_ids:
        if hex_id in analysis.ocean_hex_ids:
            continue
        resource_value = analysis.hex_resource_values.get(hex_id, 0.0)
        owner_faction_id = analysis.hex_owner_ids.get(hex_id)
        existing = current.get(hex_id)
        if existing is None:
            changes.append(
                ScorchedChange(
                    hex_id=hex_id,
                    status="applied",
                    turn=event.turn,
                    since_turn=event.turn,
                    ttl_turns=judge_output.scorched_turns,
                    severity=judge_output.fallout_severity,
                    fallout=judge_output.fallout_severity,
                    resource_value=resource_value,
                    owner_faction_id=owner_faction_id,
                    source_event_id=event.id,
                )
            )
            continue

        ttl_turns = max(int(existing.get("ttl_turns", 0) or 0), judge_output.scorched_turns)
        changes.append(
            ScorchedChange(
                hex_id=hex_id,
                status="updated",
                turn=event.turn,
                since_turn=int(existing.get("since_turn", event.turn) or event.turn),
                ttl_turns=ttl_turns,
                severity=max(
                    float(existing.get("severity", 0.0) or 0.0),
                    judge_output.fallout_severity,
                ),
                fallout=max(
                    float(existing.get("fallout", 0.0) or 0.0),
                    judge_output.fallout_severity,
                ),
                resource_value=max(
                    float(existing.get("resource_value", 0.0) or 0.0),
                    resource_value,
                ),
                owner_faction_id=owner_faction_id or _owner_from_existing(existing),
                source_event_id=event.id,
            )
        )
    return changes


def _normalize_output_for_kind(
    output: ExplosionJudgeOutput,
    kind: str,
) -> ExplosionJudgeOutput:
    if kind == "naval":
        if output.scorched_turns != 0:
            return output.model_copy(update={"scorched_turns": 0})
        return output
    if kind == "nuke" and output.scorched_turns < 4:
        return output.model_copy(update={"scorched_turns": 4})
    if output.scorched_turns <= 0:
        return output.model_copy(update={"scorched_turns": 1})
    return output


def _select_affected(kind: str, center_hex_id: str, ordered_candidates: list[str]) -> list[str]:
    max_counts = {
        "nuke": 8,
        "conventional": 4,
        "aerial": 3,
        "naval": 5,
        "siege": 4,
        "uprising": 3,
        "artillery": 4,
        "missile": 6,
        "other": 2,
    }
    limit = max_counts.get(kind, 4)
    selected = [center_hex_id]
    for hex_id in ordered_candidates:
        if hex_id == center_hex_id or hex_id in selected:
            continue
        selected.append(hex_id)
        if len(selected) >= limit:
            break
    return selected[:limit]


def _ordered_candidates(center_hex_id: str, kind: str, candidates: list[str]) -> list[str]:
    seed = f"{center_hex_id}:{kind}".encode()

    def score(hex_id: str) -> tuple[int, str]:
        digest = hashlib.sha256(seed + hex_id.encode()).hexdigest()
        return int(digest[:12], 16), hex_id

    return [hex_id for hex_id in sorted(candidates, key=score)]


def _fallback_turns(kind: str) -> int:
    return {
        "nuke": 5,
        "conventional": 2,
        "aerial": 1,
        "naval": 0,
        "siege": 2,
        "uprising": 1,
        "artillery": 1,
        "missile": 3,
        "other": 1,
    }.get(kind, 2)


def _fallback_fallout(kind: str) -> float:
    return {
        "nuke": 0.6,
        "conventional": 0.0,
        "aerial": 0.12,
        "naval": 0.0,
        "siege": 0.08,
        "uprising": 0.15,
        "artillery": 0.05,
        "missile": 0.2,
        "other": 0.02,
    }.get(kind, 0.0)


def _fallback_economic_loss(kind: str) -> float:
    return {
        "nuke": 0.35,
        "conventional": 0.12,
        "aerial": 0.08,
        "naval": 0.04,
        "siege": 0.14,
        "uprising": 0.08,
        "artillery": 0.1,
        "missile": 0.2,
        "other": 0.05,
    }.get(kind, 0.1)


def _extract_kind_from_prompt(prompt: str) -> str:
    try:
        context = parse_explosion_prompt(prompt)
        kind = str(context.get("kind") or "other")
        return kind
    except Exception:
        return "other"


def _canonical_kind(kind: str) -> str:
    if kind in {
        "nuke",
        "conventional",
        "aerial",
        "naval",
        "siege",
        "uprising",
        "artillery",
        "missile",
        "other",
    }:
        return kind
    return "other"


def _resource_value_for_cell(world_geometry: WorldGeometry, index: int) -> float:
    cell = world_geometry.cells[index]
    base = 24.0 + (1.0 - cell.elevation) * 68.0
    wobble = _deterministic_wobble(world_geometry.seed, index)
    if cell.faction_id == FactionId.magma:
        base *= 1.18
    return round(max(8.0, min(120.0, base + wobble)), 4)


def _deterministic_wobble(seed: int, index: int) -> float:
    digest = hashlib.sha256(f"{seed}:{index}".encode()).hexdigest()
    raw = int(digest[:8], 16) / 0xFFFFFFFF
    return round((raw * 8.0) - 4.0, 4)


def _state_to_map(scorched_state: dict[str, Any] | list[Any]) -> dict[str, dict[str, Any]]:
    if isinstance(scorched_state, dict):
        items = scorched_state.items()
    else:
        items = ((getattr(item, "hex_id", ""), item) for item in scorched_state)

    mapped: dict[str, dict[str, Any]] = {}
    for key, value in items:
        hex_id = str(key)
        if isinstance(value, dict):
            mapped[hex_id] = value
            continue
        mapped[hex_id] = {
            "since_turn": getattr(value, "since_turn", None),
            "ttl_turns": getattr(value, "ttl_turns", None),
            "severity": getattr(value, "severity", None),
            "fallout": getattr(value, "fallout", None),
            "owner_faction_id": getattr(value, "owner_faction_id", None),
            "resource_value": getattr(value, "resource_value", None),
        }
    return mapped


def _owner_from_existing(existing: dict[str, Any]) -> FactionId | None:
    owner = existing.get("owner_faction_id")
    if owner is None:
        return None
    try:
        return FactionId(str(owner))
    except Exception:
        return None
