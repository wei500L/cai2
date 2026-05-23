"""Prompt builder for explosion judgment."""

# ruff: noqa: E501,RUF001
from __future__ import annotations

import json
from collections import deque
from typing import Any

from app.domain.enums import TerrainKind
from app.domain.world_geometry import WorldGeometry

_SYSTEM_PROMPT = """你是《外交风云》中的战场范围判定模型。你的工作是给一个军事冲突事件确定波及的 hex 单元、焦土持续时间、放射污染、经济损失。
规则：
1. 只能使用提供的 hex 邻接关系扩散。
2. 中心 hex 必须在 affected_hex_ids 第一位。
3. nuke 半径不超过 400km（约 8 个 hex）。
4. conventional 半径不超过 120km（约 2-3 个 hex）。
5. 海洋 hex 不会变焦土，但纳入 affected_hex_ids 表示军舰损失。
6. scorched_turns ∈ [0, 6]，naval 可以为 0，nuke 必须 >=4。
7. 输出必须是严格 JSON，无前后多余字符。"""


def build_explosion_judge_prompt(
    event: Any,
    world_geometry: WorldGeometry | None,
    scorched_state: dict[str, Any] | list[Any],
    turn: int,
) -> str:
    context = _build_context(event, world_geometry, scorched_state, turn)
    return f"{_SYSTEM_PROMPT}\n\n{json.dumps(context, ensure_ascii=False, separators=(',', ':'))}"


def parse_explosion_prompt(prompt: str) -> dict[str, Any]:
    start = prompt.find("{")
    end = prompt.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("explosion prompt does not contain a JSON context")
    return json.loads(prompt[start : end + 1])


def _build_context(
    event: Any,
    world_geometry: WorldGeometry | None,
    scorched_state: dict[str, Any] | list[Any],
    turn: int,
) -> dict[str, Any]:
    event_payload = _normalize_mapping(getattr(event, "payload", None))
    region_id = (
        _stringify(event_payload.get("region_id"))
        or _stringify(getattr(event, "region_id", None))
        or _stringify(event_payload.get("target_region"))
        or _stringify(event_payload.get("source_region"))
    )
    center_hex_id = _resolve_center_hex_id(world_geometry, event_payload, region_id)
    kind = _detect_kind(event, event_payload, world_geometry)
    nodes, center_hex_id = _build_subgraph(world_geometry, center_hex_id)

    scorched_items = [_normalize_scorched_item(item) for item in _iter_items(scorched_state)]
    return {
        "turn": turn,
        "event": {
            "id": _stringify(getattr(event, "id", None)),
            "kind": _stringify(getattr(event, "kind", None)),
            "actor_faction": _stringify(getattr(event, "actor_faction", None)),
            "target_faction": _stringify(getattr(event, "target_faction", None)),
            "region_id": region_id,
            "narration": _stringify(getattr(event, "narration", None)),
            "payload": _compact_payload(event_payload),
        },
        "kind": kind,
        "center_hex_id": center_hex_id,
        "center_region_id": region_id,
        "subgraph": {"nodes": nodes},
        "scorched_state": scorched_items[:24],
        "scorched_state_truncated": len(scorched_items) > 24,
    }


def _build_subgraph(
    world_geometry: WorldGeometry | None,
    center_hex_id: str,
) -> tuple[list[dict[str, Any]], str]:
    if world_geometry is None or not world_geometry.cells:
        return [], center_hex_id

    index_by_hex_id = {cell.hex_id: index for index, cell in enumerate(world_geometry.cells)}
    center_index = index_by_hex_id.get(center_hex_id)
    if center_index is None:
        center_index = _index_from_region_id(center_hex_id)
    if center_index is None:
        center_index = _index_from_hex_id(center_hex_id)
    if center_index is None or center_index < 0 or center_index >= len(world_geometry.cells):
        return [], center_hex_id

    nodes, _distances = _collect_within_hops(world_geometry, center_index, max_hops=2)
    ordered_nodes = sorted(nodes, key=lambda index: (_distances[index], index))
    payload_nodes = [_node_payload(world_geometry, index, _distances[index]) for index in ordered_nodes[:25]]
    return payload_nodes, world_geometry.cells[center_index].hex_id


def _collect_within_hops(
    world_geometry: WorldGeometry,
    center_index: int,
    *,
    max_hops: int,
) -> tuple[set[int], dict[int, int]]:
    distances: dict[int, int] = {center_index: 0}
    queue: deque[int] = deque([center_index])
    while queue:
        current = queue.popleft()
        current_dist = distances[current]
        if current_dist >= max_hops:
            continue
        for neighbor_index in world_geometry.cells[current].neighbors:
            if neighbor_index < 0 or neighbor_index >= len(world_geometry.cells):
                continue
            if neighbor_index in distances:
                continue
            distances[neighbor_index] = current_dist + 1
            queue.append(neighbor_index)
    return set(distances), distances


def _node_payload(world_geometry: WorldGeometry, index: int, hop: int) -> dict[str, Any]:
    cell = world_geometry.cells[index]
    return {
        "hex_id": cell.hex_id,
        "terrain": cell.terrain.value,
        "faction_id": str(cell.faction_id),
        "hop": hop,
        "neighbors": [world_geometry.cells[neighbor_index].hex_id for neighbor_index in cell.neighbors if 0 <= neighbor_index < len(world_geometry.cells)],
    }


def _detect_kind(event: Any, event_payload: dict[str, Any], world_geometry: WorldGeometry | None) -> str:
    candidate_values = [
        _stringify(event_payload.get("weapon_kind")),
        _stringify(event_payload.get("kind")),
        _stringify(event_payload.get("movement")),
        _stringify(getattr(event, "kind", None)),
        _stringify(getattr(event, "narration", None)),
    ]
    text = " ".join(value.lower() for value in candidate_values if value)

    if any(keyword in text for keyword in ("nuke", "核", "atomic", "nuclear")):
        return "nuke"
    if any(keyword in text for keyword in ("naval", "海战", "舰", "ship", "fleet")):
        return "naval"
    if any(keyword in text for keyword in ("aerial", "空袭", "air", "航空", "bomb")):
        return "aerial"
    if any(keyword in text for keyword in ("missile", "导弹", "rocket")):
        return "missile"
    if any(keyword in text for keyword in ("artillery", "炮", "siege", "攻城")):
        return "artillery"
    if world_geometry is not None:
        region_id = _stringify(event_payload.get("region_id")) or _stringify(getattr(event, "region_id", None))
        center_hex_id = _resolve_center_hex_id(world_geometry, event_payload, region_id)
        if center_hex_id is not None:
            center_index = _index_from_region_id(center_hex_id)
            if center_index is None:
                center_index = _index_from_hex_id(center_hex_id)
            if center_index is not None and 0 <= center_index < len(world_geometry.cells):
                if world_geometry.cells[center_index].terrain is TerrainKind.ocean:
                    return "naval"
    return "conventional"


def _normalize_scorched_item(item: Any) -> dict[str, Any]:
    if isinstance(item, dict):
        return {
            "hex_id": _stringify(item.get("hex_id")),
            "ttl_turns": item.get("ttl_turns"),
            "severity": item.get("severity"),
            "fallout": item.get("fallout"),
            "turn": item.get("turn"),
        }
    return {
        "hex_id": _stringify(getattr(item, "hex_id", None)),
        "ttl_turns": getattr(item, "ttl_turns", None),
        "severity": getattr(item, "severity", None),
        "fallout": getattr(item, "fallout", None),
        "turn": getattr(item, "turn", None),
    }


def _compact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "region_id",
        "center_lat",
        "center_lng",
        "atk_loss",
        "def_loss",
        "territory_captured",
        "morale_shift",
        "narrative",
        "attacker_remaining_troops",
        "defender_remaining_troops",
        "weapon_kind",
        "kind",
        "movement",
    )
    return {key: payload[key] for key in keys if key in payload}


def _iter_items(value: dict[str, Any] | list[Any]) -> list[Any]:
    if isinstance(value, dict):
        return list(value.values())
    return list(value)


def _normalize_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return {}


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _region_to_hex_id(region_id: str | None) -> str | None:
    if not region_id:
        return None
    if region_id.startswith("H") and "_" in region_id:
        return region_id
    return None


def _resolve_center_hex_id(
    world_geometry: WorldGeometry | None,
    event_payload: dict[str, Any],
    region_id: str,
) -> str:
    direct = _stringify(event_payload.get("center_hex_id")) or _stringify(event_payload.get("hex_id"))
    if direct:
        return direct
    if world_geometry is None:
        return _region_to_hex_id(region_id) or region_id
    index = _index_from_region_id(region_id)
    if index is not None and 0 <= index < len(world_geometry.cells):
        return world_geometry.cells[index].hex_id
    mapped = _region_to_hex_id(region_id)
    if mapped:
        return mapped
    return region_id


def _index_from_hex_id(hex_id: str | None) -> int | None:
    if not hex_id:
        return None
    suffix = hex_id.rsplit("_", 1)[-1]
    if not suffix:
        return None
    try:
        return int(suffix)
    except ValueError:
        return None


def _index_from_region_id(region_id: str | None) -> int | None:
    if not region_id:
        return None
    suffix = region_id.rsplit("_", 1)[-1]
    if not suffix:
        return None
    try:
        return int(suffix)
    except ValueError:
        return None
