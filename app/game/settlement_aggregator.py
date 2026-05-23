from __future__ import annotations

from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field

from app.core.clock import Clock
from app.domain.enums import FactionId
from app.domain.factions import FACTION_META
from app.domain.models import (
    DiaryEntry,
    FactionState,
    GameAction,
    GameEvent,
    IntelAction,
    MapRegion,
    MilitaryAction,
    PrivateMessageAction,
    Relationship,
    SpeechAction,
    Treaty,
    TreatyAction,
)
from app.repositories.factory import Repositories

_ACTION_BUCKETS = ("speech", "private", "treaty", "military", "intel", "lock")
_PERSONALITY_KEYS = (
    "aggression",
    "trust_base",
    "honor_code",
)
_MAX_DIARY_MEMORY_DEPTH = 80


class SettlementInput(BaseModel):
    model_config = ConfigDict(strict=True, arbitrary_types_allowed=True)

    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    factions_snapshot: list[FactionState]
    relationships_snapshot: list[Relationship]
    regions_snapshot: list[MapRegion]
    treaties_snapshot: list[Treaty]
    turn_actions: list[GameAction]
    public_speeches: list[SpeechAction]
    private_messages: list[PrivateMessageAction]
    treaty_requests: list[TreatyAction]
    military_orders: list[MilitaryAction]
    intel_actions: list[IntelAction]
    recent_events: list[GameEvent]
    faction_recent_diaries: dict[FactionId, list[DiaryEntry]] = Field(default_factory=dict)
    faction_personality_summary: dict[FactionId, dict[str, Any]]
    relationship_summary_text: str
    faction_stats_summary_text: str


class SettlementAggregator:
    def __init__(
        self,
        repos: Repositories,
        clock: Clock,
        *,
        recent_event_window: int = 20,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._recent_event_window = recent_event_window

    async def aggregate(self, room_id: str, epoch: int, turn: int) -> SettlementInput:
        return await self._aggregate(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            recent_event_window=self._recent_event_window,
        )

    async def aggregate_epoch_summary(self, room_id: str, epoch: int) -> SettlementInput:
        current_turn = await self._repos.state.get_current_turn(room_id)
        if current_turn is not None and current_turn.epoch == epoch:
            last_turn = current_turn.turn
        else:
            events = await self._repos.events.list_all(room_id)
            last_turn = max(
                (event.turn for event in events if event.epoch == epoch),
                default=1,
            )

        return await self._aggregate(
            room_id=room_id,
            epoch=epoch,
            turn=last_turn,
            recent_event_window=80,
        )

    async def _aggregate(
        self,
        *,
        room_id: str,
        epoch: int,
        turn: int,
        recent_event_window: int,
    ) -> SettlementInput:
        actions = await self._repos.actions.list_by_turn(room_id, epoch, turn)
        action_buckets = split_actions_by_mode(actions)

        factions = await self._repos.state.get_factions(room_id)
        relationships = await self._repos.state.get_relationships(room_id)
        regions = await self._repos.state.get_regions(room_id)
        treaties = await self._repos.state.get_treaties(room_id)
        _current_turn = await self._repos.state.get_current_turn(room_id)

        recent_events = await self._load_recent_events(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            recent_event_window=recent_event_window,
        )
        faction_recent_diaries = await self._load_recent_diaries(room_id)

        return SettlementInput(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            generated_at_ms=self._clock.now_ms(),
            factions_snapshot=factions,
            relationships_snapshot=relationships,
            regions_snapshot=regions,
            treaties_snapshot=treaties,
            turn_actions=actions,
            public_speeches=cast(list[SpeechAction], action_buckets["speech"]),
            private_messages=cast(list[PrivateMessageAction], action_buckets["private"]),
            treaty_requests=cast(list[TreatyAction], action_buckets["treaty"]),
            military_orders=cast(list[MilitaryAction], action_buckets["military"]),
            intel_actions=cast(list[IntelAction], action_buckets["intel"]),
            recent_events=recent_events,
            faction_recent_diaries=faction_recent_diaries,
            faction_personality_summary=_build_faction_personality_summary(),
            relationship_summary_text=self._build_relationship_summary_text(relationships),
            faction_stats_summary_text=self._build_faction_stats_summary_text(factions),
        )

    async def _load_recent_events(
        self,
        *,
        room_id: str,
        epoch: int,
        turn: int,
        recent_event_window: int,
    ) -> list[GameEvent]:
        current_events = await self._repos.events.list_by_turn(room_id, epoch, turn)
        previous_events = await self._load_previous_turn_events(room_id, epoch, turn)
        events = [*current_events, *previous_events]

        # MVP settlement input is adjudicator-facing. Future viewer-perspective filtering can
        # remove Level 3 secrets before reusing these summaries for player-visible surfaces.
        return sorted(
            events,
            key=lambda event: (event.created_at_ms, event.epoch, event.turn, event.id),
            reverse=True,
        )[:recent_event_window]

    async def _load_previous_turn_events(
        self,
        room_id: str,
        epoch: int,
        turn: int,
    ) -> list[GameEvent]:
        if turn > 1:
            return await self._repos.events.list_by_turn(room_id, epoch, turn - 1)

        all_events = await self._repos.events.list_all(room_id)
        previous_key = max(
            (
                (event.epoch, event.turn)
                for event in all_events
                if (event.epoch, event.turn) < (epoch, turn)
            ),
            default=None,
        )
        if previous_key is None:
            return []

        previous_epoch, previous_turn = previous_key
        return await self._repos.events.list_by_turn(room_id, previous_epoch, previous_turn)

    async def _load_recent_diaries(self, room_id: str) -> dict[FactionId, list[DiaryEntry]]:
        diaries: dict[FactionId, list[DiaryEntry]] = {}
        for faction_id, meta in FACTION_META.items():
            depth = int(meta.personality.get("memory_depth", 0))
            max_entries = min(max(depth, 0), _MAX_DIARY_MEMORY_DEPTH)
            diaries[faction_id] = await self._repos.diaries.list_recent(
                room_id,
                faction_id,
                max_entries=max_entries,
            )
        return diaries

    def _build_relationship_summary_text(self, relationships: list[Relationship]) -> str:
        if not relationships:
            return "No relationships recorded."

        ordered = sorted(
            relationships,
            key=lambda rel: (str(rel.from_faction), str(rel.to_faction)),
        )
        return "\n".join(format_relationship_line(rel) for rel in ordered)

    def _build_faction_stats_summary_text(self, factions: list[FactionState]) -> str:
        if not factions:
            return "No faction stats recorded."

        header = (
            "faction | military | economy | diplomacy | culture | morale | "
            "total_power | status"
        )
        divider = "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---"
        ordered = sorted(factions, key=lambda faction: str(faction.id))
        lines = [format_faction_stats_line(faction) for faction in ordered]
        return "\n".join([header, divider, *lines])


def split_actions_by_mode(actions: list[GameAction]) -> dict[str, list[GameAction]]:
    buckets: dict[str, list[GameAction]] = {mode: [] for mode in _ACTION_BUCKETS}
    for action in actions:
        buckets.setdefault(action.mode, []).append(action)
    return buckets


def format_faction_stats_line(state: FactionState) -> str:
    return (
        f"{state.id} | {state.military:.1f} | {state.economy:.1f} | "
        f"{state.diplomacy:.1f} | {state.culture:.1f} | {state.morale:.2f} | "
        f"{state.total_power:.1f} | {state.status}"
    )


def format_relationship_line(rel: Relationship) -> str:
    treaties = ", ".join(str(treaty) for treaty in rel.treaties) if rel.treaties else "none"
    return (
        f"{rel.from_faction} -> {rel.to_faction}: "
        f"{rel.status} ({rel.value:+.1f}), treaties={treaties}, "
        f"last_changed_turn={rel.last_changed_turn}"
    )


def _build_faction_personality_summary() -> dict[FactionId, dict[str, Any]]:
    summary: dict[FactionId, dict[str, Any]] = {}
    for faction_id, meta in FACTION_META.items():
        summary[faction_id] = {
            "archetype": meta.archetype,
            "speech_style": meta.speech_style,
            "trigger_words": list(meta.trigger_words),
            **{key: meta.personality[key] for key in _PERSONALITY_KEYS},
        }
    return summary
