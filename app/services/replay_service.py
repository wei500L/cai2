from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.clock import Clock
from app.core.errors import RoomNotFoundError
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    RelationshipStatus,
    RoomStatus,
    VisibilityScope,
)
from app.domain.faction_meta import FactionMeta
from app.domain.factions import all_faction_ids
from app.domain.models import (
    FactionStatChange,
    FactionState,
    GameAction,
    GameEvent,
    GameRoom,
    Relationship,
    SettlementResult,
    SpeechAction,
    TreatyAction,
)
from app.game.relationships_init import relationship_status_for_value
from app.repositories.base import MessageRecord
from app.repositories.factory import Repositories
from app.services.factions_meta_service import FactionsMetaService


class ReplayTimelineEntry(BaseModel):
    model_config = ConfigDict(strict=True)

    epoch: int
    turn: int
    phase: GamePhase
    key_event_ids: list[str] = Field(default_factory=list)


class ReplayDTO(BaseModel):
    model_config = ConfigDict(strict=True)

    room_id: str
    generated_at_ms: int
    mode: str
    start_ts: int = 0
    end_ts: int = 0
    in_progress: bool = False
    total_epochs: int
    total_turns: int
    timeline: list[ReplayTimelineEntry]
    factions: list[FactionMeta] = Field(default_factory=list)
    public_events: list[dict[str, Any]]
    private_messages: list[dict[str, Any]]
    ai_internal_thoughts: list[dict[str, Any]]
    ai_inner_thoughts: list[dict[str, Any]] = Field(default_factory=list)
    faction_curves: list[dict[str, Any]]
    relationship_snapshots: list[dict[str, Any]]
    key_moments: list[dict[str, Any]]
    famous_quotes: list[dict[str, Any]]
    betrayal_events: list[dict[str, Any]]
    deception_stats: list[dict[str, Any]]
    final_factions: list[FactionState]
    winner: FactionId | None
    final_narration: str


class ReplayService:
    def __init__(self, repos: Repositories, clock: Clock) -> None:
        self._repos = repos
        self._clock = clock
        self._factions_meta_service = FactionsMetaService(repos)

    async def build_replay(self, room_id: str) -> ReplayDTO:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            raise RoomNotFoundError(f"room {room_id} not found")
        replay = await self.build_replay_dto(room)
        await self._repos.replays.save_replay(room_id, replay.model_dump(mode="json"))
        return replay

    async def build_replay_dto(self, room: GameRoom) -> ReplayDTO:
        is_finished = room.status == RoomStatus.finished

        (
            events,
            messages,
            settlements,
            final_factions,
            final_relationships,
            actions,
            diaries_by_faction,
            factions_meta,
        ) = await asyncio.gather(
            self._repos.events.list_all(room.id),
            self._repos.messages.list_by_room(room.id),
            self._repos.settlements.list_by_room(room.id),
            self._repos.state.get_factions(room.id),
            self._repos.state.get_relationships(room.id),
            self._repos.actions.list_by_room(room.id),
            self._repos.diaries.list_all_by_room(room.id),
            self._factions_meta_service.get_factions_meta(room.id),
        )

        if not is_finished:
            cutoff = (room.current.epoch, room.current.turn)
            events = _filter_by_turn(events, cutoff)
            messages = _filter_by_turn(messages, cutoff)
            settlements = _filter_by_turn(settlements, cutoff)
            actions = _filter_by_turn(actions, cutoff)
            diaries_by_faction = {
                faction_id: _filter_by_turn(entries, cutoff)
                for faction_id, entries in diaries_by_faction.items()
            }

        events = sorted(events, key=_event_sort_key)
        messages = sorted(messages, key=_message_sort_key)
        settlements = sorted(settlements, key=_settlement_sort_key)
        actions = sorted(actions, key=_action_sort_key)

        timeline = _build_timeline(events)
        turn_keys = _turn_keys(room, events, messages, settlements, actions)
        ai_thoughts = _ai_internal_thoughts(diaries_by_faction) if is_finished else []
        start_ts, end_ts = _replay_window(
            room,
            events,
            messages,
            settlements,
            actions,
            diaries_by_faction,
            is_finished,
            self._clock.now_ms(),
        )

        return ReplayDTO(
            room_id=room.id,
            generated_at_ms=self._clock.now_ms(),
            mode=room.mode,
            start_ts=start_ts,
            end_ts=end_ts,
            in_progress=not is_finished,
            total_epochs=_total_epochs(room, turn_keys, settlements, events),
            total_turns=len(turn_keys),
            timeline=timeline,
            factions=sorted(factions_meta, key=lambda faction: str(faction.id)),
            public_events=[_dump_model(event) for event in events],
            private_messages=[_dump_model(message) for message in _private_messages(messages)],
            ai_internal_thoughts=ai_thoughts,
            ai_inner_thoughts=ai_thoughts,
            faction_curves=_faction_curves(turn_keys, settlements, final_factions),
            relationship_snapshots=_relationship_snapshots(
                turn_keys,
                settlements,
                final_relationships,
            ),
            key_moments=[_dump_model(event) for event in _key_moments(events)],
            famous_quotes=_famous_quotes(actions),
            betrayal_events=[_dump_model(event) for event in _betrayal_events(events)],
            deception_stats=_deception_stats(settlements, actions, events),
            final_factions=sorted(final_factions, key=lambda faction: str(faction.id)),
            winner=_winner(final_factions) if is_finished else None,
            final_narration=_final_narration(settlements, events)
            if is_finished
            else "游戏尚未结束, 当前复盘为中途快照。",
        )

    async def export_replay_dto(self, room_id: str) -> dict[str, Any]:
        return (await self.build_replay(room_id)).model_dump(mode="json")


def _build_timeline(events: list[GameEvent]) -> list[ReplayTimelineEntry]:
    key_event_ids: dict[tuple[int, int, GamePhase], list[str]] = defaultdict(list)
    for event in events:
        key_event_ids[(event.epoch, event.turn, event.phase)].append(event.id)

    return [
        ReplayTimelineEntry(
            epoch=epoch,
            turn=turn,
            phase=phase,
            key_event_ids=key_event_ids[(epoch, turn, phase)],
        )
        for epoch, turn, phase in sorted(key_event_ids, key=_timeline_sort_key)
    ]


def _turn_keys(
    room: GameRoom,
    events: list[GameEvent],
    messages: list[MessageRecord],
    settlements: list[SettlementResult],
    actions: list[GameAction],
) -> list[tuple[int, int]]:
    keys = {(room.current.epoch, room.current.turn)}
    keys.update((event.epoch, event.turn) for event in events)
    keys.update((message.epoch, message.turn) for message in messages)
    keys.update((settlement.epoch, settlement.turn) for settlement in settlements)
    keys.update((action.epoch, action.turn) for action in actions)
    return sorted(keys)


def _total_epochs(
    room: GameRoom,
    turn_keys: list[tuple[int, int]],
    settlements: list[SettlementResult],
    events: list[GameEvent],
) -> int:
    epochs = [room.current.epoch]
    epochs.extend(epoch for epoch, _ in turn_keys)
    epochs.extend(settlement.epoch for settlement in settlements)
    epochs.extend(event.epoch for event in events)
    return max(epochs, default=0)


def _filter_by_turn(items: list[Any], cutoff: tuple[int, int]) -> list[Any]:
    return [
        item
        for item in items
        if (getattr(item, "epoch", 0), getattr(item, "turn", 0)) <= cutoff
    ]


def _replay_window(
    room: GameRoom,
    events: list[GameEvent],
    messages: list[MessageRecord],
    settlements: list[SettlementResult],
    actions: list[GameAction],
    diaries_by_faction: dict[FactionId, list[Any]],
    is_finished: bool,
    now_ms: int,
) -> tuple[int, int]:
    timestamps: list[int] = [room.created_at_ms, room.current.phase_started_at_ms]
    timestamps.extend(event.created_at_ms for event in events)
    timestamps.extend(message.created_at_ms for message in messages)
    timestamps.extend(settlement.generated_at_ms for settlement in settlements)
    timestamps.extend(action.created_at_ms for action in actions)
    timestamps.extend(
        entry.created_at_ms
        for entries in diaries_by_faction.values()
        for entry in entries
    )

    start_ts = min(timestamps) if timestamps else room.created_at_ms
    end_ts = max(timestamps) if timestamps else room.created_at_ms
    if not is_finished:
        end_ts = max(end_ts, now_ms)
    return start_ts, end_ts


def _private_messages(messages: list[MessageRecord]) -> list[MessageRecord]:
    return [
        message
        for message in messages
        if message.visibility.scope != VisibilityScope.public
    ]


def _ai_internal_thoughts(
    diaries_by_faction: dict[FactionId, list[Any]],
) -> list[dict[str, Any]]:
    thoughts: list[dict[str, Any]] = []
    for faction_id, entries in diaries_by_faction.items():
        for entry in entries:
            thoughts.append(
                {
                    "faction_id": faction_id.value,
                    "epoch": entry.epoch,
                    "turn": entry.turn,
                    "text": entry.internal_thought,
                }
            )

    return sorted(
        thoughts,
        key=lambda item: (item["epoch"], item["turn"], item["faction_id"], item["text"]),
    )


def _first_speech_by_turn(actions: list[GameAction]) -> dict[tuple[int, int], str]:
    result: dict[tuple[int, int], str] = {}
    for action in actions:
        if not isinstance(action, SpeechAction):
            continue
        key = (action.epoch, action.turn)
        if key in result:
            continue
        content = action.content.strip()
        result[key] = content[:28] if content else "条件"
    return result


def _ai_factions(room: GameRoom) -> list[FactionId]:
    if room.ai_factions:
        return sorted(room.ai_factions, key=str)
    human_factions = {player.faction_id for player in room.players if player.faction_id is not None}
    return sorted(
        [faction_id for faction_id in all_faction_ids() if faction_id not in human_factions],
        key=str,
    )


def _faction_curves(
    turn_keys: list[tuple[int, int]],
    settlements: list[SettlementResult],
    final_factions: list[FactionState],
) -> list[dict[str, Any]]:
    faction_ids = sorted(
        set(all_faction_ids())
        | {faction.id for faction in final_factions}
        | {
            change.faction_id
            for settlement in settlements
            for change in settlement.faction_stat_changes
        },
        key=str,
    )
    current_power = {faction.id: faction.total_power for faction in final_factions}
    changes_by_turn: dict[tuple[int, int], list[FactionStatChange]] = defaultdict(list)
    for settlement in settlements:
        changes_by_turn[(settlement.epoch, settlement.turn)].extend(
            settlement.faction_stat_changes
        )

    snapshots: dict[tuple[int, int], dict[FactionId, float]] = {}
    for key in sorted(turn_keys, reverse=True):
        for change in changes_by_turn.get(key, []):
            if change.faction_id not in current_power and change.resulting_total_power is not None:
                current_power[change.faction_id] = change.resulting_total_power
        snapshots[key] = {
            faction_id: round(current_power.get(faction_id, 0.0), 4)
            for faction_id in faction_ids
        }
        for change in reversed(changes_by_turn.get(key, [])):
            current_power[change.faction_id] = round(
                current_power.get(
                    change.faction_id,
                    change.resulting_total_power or 0.0,
                )
                - _total_power_delta(change),
                4,
            )

    return [
        {
            "faction_id": faction_id.value,
            "points": [
                {
                    "epoch": epoch,
                    "turn": turn,
                    "total_power": snapshots[(epoch, turn)][faction_id],
                }
                for epoch, turn in turn_keys
            ],
        }
        for faction_id in faction_ids
    ]


def _total_power_delta(change: FactionStatChange) -> float:
    return round(
        change.military_delta * 0.35
        + change.economy_delta * 0.25
        + change.diplomacy_delta * 0.25
        + change.culture_delta * 0.15,
        4,
    )


def _relationship_snapshots(
    turn_keys: list[tuple[int, int]],
    settlements: list[SettlementResult],
    final_relationships: list[Relationship],
) -> list[dict[str, Any]]:
    epochs = sorted(
        {epoch for epoch, _ in turn_keys} | {settlement.epoch for settlement in settlements}
    )
    if not epochs:
        return []

    current = {
        (relationship.from_faction, relationship.to_faction): relationship.model_copy(deep=True)
        for relationship in final_relationships
    }
    settlements_by_epoch: dict[int, list[SettlementResult]] = defaultdict(list)
    for settlement in settlements:
        settlements_by_epoch[settlement.epoch].append(settlement)

    snapshots: dict[int, dict[str, dict[str, str]]] = {}
    for epoch in sorted(epochs, reverse=True):
        snapshots[epoch] = _relationship_matrix(current)
        for settlement in sorted(
            settlements_by_epoch.get(epoch, []),
            key=_settlement_sort_key,
            reverse=True,
        ):
            for delta in reversed(settlement.relationship_deltas):
                key = (delta.from_faction, delta.to_faction)
                relationship = current.get(key)
                if relationship is None:
                    relationship = Relationship(
                        from_faction=delta.from_faction,
                        to_faction=delta.to_faction,
                        value=0.0,
                        status=RelationshipStatus.neutral,
                        treaties=[],
                        last_changed_turn=settlement.turn,
                    )
                relationship.value = round(relationship.value - delta.delta, 4)
                relationship.status = relationship_status_for_value(relationship.value)
                current[key] = relationship

    return [{"epoch": epoch, "matrix": snapshots[epoch]} for epoch in epochs]


def _relationship_matrix(
    relationships: dict[tuple[FactionId, FactionId], Relationship],
) -> dict[str, dict[str, str]]:
    matrix: dict[str, dict[str, str]] = {
        faction_id.value: {} for faction_id in all_faction_ids()
    }
    for (from_faction, to_faction), relationship in sorted(
        relationships.items(),
        key=lambda item: (str(item[0][0]), str(item[0][1])),
    ):
        matrix.setdefault(from_faction.value, {})[to_faction.value] = relationship.status.value
    return matrix


def _key_moments(events: list[GameEvent]) -> list[GameEvent]:
    return [event for event in events if event.priority == EventPriority.P0]


def _betrayal_events(events: list[GameEvent]) -> list[GameEvent]:
    return [
        event
        for event in events
        if event.kind in {EventKind.betrayal, EventKind.declare_war}
    ]


def _famous_quotes(actions: list[GameAction]) -> list[dict[str, Any]]:
    speeches = [action for action in actions if isinstance(action, SpeechAction)]
    ranked = sorted(
        speeches,
        key=lambda action: (-len(action.content), action.epoch, action.turn, action.id),
    )[:5]
    return [
        {
            "actor_faction": action.actor_faction.value,
            "content": action.content,
            "epoch": action.epoch,
            "turn": action.turn,
        }
        for action in ranked
    ]


def _deception_stats(
    settlements: list[SettlementResult],
    actions: list[GameAction],
    events: list[GameEvent],
) -> list[dict[str, Any]]:
    lies = {faction_id: 0 for faction_id in all_faction_ids()}
    exposed = {faction_id: 0 for faction_id in all_faction_ids()}
    treaty_participants = _treaty_participants(actions, settlements)
    betrayal_events = _betrayal_events(events)

    for settlement in settlements:
        for decision in settlement.treaty_decisions:
            if not decision.accepted:
                continue
            participants = treaty_participants.get(decision.treaty_id, set())
            for faction_id in participants:
                if any(
                    _is_after(event, settlement) and _mentions_faction(event, faction_id)
                    for event in betrayal_events
                ):
                    lies[faction_id] += 1

    for event in events:
        if event.kind != EventKind.intel:
            continue
        for faction_id in all_faction_ids():
            if _mentions_faction(event, faction_id):
                exposed[faction_id] += 1

    stats = []
    for faction_id in sorted(all_faction_ids(), key=str):
        denominator = lies[faction_id] + exposed[faction_id]
        stats.append(
            {
                "faction_id": faction_id.value,
                "lies": lies[faction_id],
                "exposed": exposed[faction_id],
                "success_rate": round(lies[faction_id] / denominator, 4) if denominator else 0.0,
            }
        )
    return stats


def _treaty_participants(
    actions: list[GameAction],
    settlements: list[SettlementResult],
) -> dict[str, set[FactionId]]:
    participants: dict[str, set[FactionId]] = defaultdict(set)
    for action in actions:
        if isinstance(action, TreatyAction):
            participants[action.id].update({action.actor_faction, *action.target_factions})
    for settlement in settlements:
        for treaty in settlement.created_treaties:
            participants[treaty.id].update(treaty.parties)
            source_action_id = treaty.metadata.get("source_action_id")
            if isinstance(source_action_id, str):
                participants[source_action_id].update(treaty.parties)
    return participants


def _is_after(event: GameEvent, settlement: SettlementResult) -> bool:
    return (event.epoch, event.turn, event.created_at_ms) > (
        settlement.epoch,
        settlement.turn,
        settlement.generated_at_ms,
    )


def _mentions_faction(event: GameEvent, faction_id: FactionId) -> bool:
    if event.actor_faction == faction_id or event.target_faction == faction_id:
        return True
    faction_value = faction_id.value
    return faction_value in event.narration or faction_value in str(event.payload)


def _winner(final_factions: list[FactionState]) -> FactionId | None:
    if not final_factions:
        return None
    return max(final_factions, key=lambda faction: faction.total_power).id


def _final_narration(
    settlements: list[SettlementResult],
    events: list[GameEvent],
) -> str:
    if settlements:
        last = max(settlements, key=_settlement_sort_key)
        narration = " ".join(
            event.narration for event in sorted(last.narration_events, key=_event_sort_key)
        )
        if narration:
            return narration
    if events:
        return max(events, key=_event_sort_key).narration
    return ""


def _dump_model(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json")


def _event_sort_key(event: GameEvent) -> tuple[int, int, int, int, str]:
    return (
        event.epoch,
        event.turn,
        _phase_order(event.phase),
        event.created_at_ms,
        event.id,
    )


def _message_sort_key(message: MessageRecord) -> tuple[int, int, int, int, str]:
    return (
        message.epoch,
        message.turn,
        _phase_order(message.phase),
        message.created_at_ms,
        message.id,
    )


def _settlement_sort_key(settlement: SettlementResult) -> tuple[int, int, int]:
    return settlement.epoch, settlement.turn, settlement.generated_at_ms


def _action_sort_key(action: GameAction) -> tuple[int, int, int, int, str]:
    return (
        action.epoch,
        action.turn,
        _phase_order(action.phase),
        action.created_at_ms,
        action.id,
    )


def _timeline_sort_key(key: tuple[int, int, GamePhase]) -> tuple[int, int, int]:
    epoch, turn, phase = key
    return epoch, turn, _phase_order(phase)


def _phase_order(phase: GamePhase) -> int:
    return {
        GamePhase.observe: 0,
        GamePhase.action: 1,
        GamePhase.resolve: 2,
        GamePhase.arbitrate: 3,
    }[phase]
