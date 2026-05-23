from __future__ import annotations

from random import Random
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from app.core.clock import Clock
from app.core.errors import DiplomacyError
from app.domain.enums import EventKind, EventPriority, FactionId, GamePhase, VisibilityScope
from app.domain.factions import FACTION_LABELS
from app.domain.models import FactionState, GameEvent, MessageVisibility
from app.llm.output_schema import AISpeechItem, SettlementModelOutput
from app.repositories.base import MessageRecord
from app.repositories.factory import Repositories
from app.services.ai_templates import (
    AI_PRIVATE_TEMPLATES,
    AI_REACTION_TEMPLATES,
    AI_SPEECH_TEMPLATES,
    SYSTEM_NARRATION_TEMPLATES,
)

_SpeechKind = Literal["public", "private", "reaction", "narration"]

_CONFLICT_EVENT_KINDS = {
    EventKind.battle,
    EventKind.declare_war,
    EventKind.betrayal,
    EventKind.intel,
}
_COOP_EVENT_KINDS = {
    EventKind.alliance,
    EventKind.trade,
    EventKind.non_aggression,
    EventKind.ceasefire,
}
_CONFLICT_WORDS = ("战", "攻", "威胁", "背叛", "冲突", "敌", "war", "attack", "betray")
_COOP_WORDS = ("合作", "联盟", "贸易", "停火", "协议", "peace", "trade", "alliance")


class AIOutputBundle(BaseModel):
    model_config = ConfigDict(strict=True)

    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    ai_speak_events: list[dict[str, Any]]
    ai_reaction_events: list[dict[str, Any]]
    private_message_events: list[dict[str, Any]]
    narration_events: list[dict[str, Any]]


class AIOutputService:
    def __init__(
        self,
        *,
        repos: Repositories,
        clock: Clock,
        rng_seed: int | None = None,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._rng = Random(rng_seed)

    async def generate_ai_reactions_from_settlement(
        self,
        room_id: str,
        epoch: int,
        turn: int,
        model_output: SettlementModelOutput,
        *,
        factions_snapshot: list[FactionState] | None = None,
        recent_events: list[GameEvent] | None = None,
    ) -> AIOutputBundle:
        factions_snapshot = (
            factions_snapshot
            if factions_snapshot is not None
            else await self._repos.state.get_factions(room_id)
        )
        recent_events = (
            recent_events if recent_events is not None else await self._recent_events(room_id)
        )

        raw_items: list[AISpeechItem | dict[str, Any]]
        if model_output.ai_speeches:
            raw_items = list(model_output.ai_speeches)
            source = "model"
        else:
            raw_items = fallback_generate(factions_snapshot, recent_events, rng=self._rng)
            source = "fallback"

        generated_at_ms = self._clock.now_ms()
        output = _MutableOutput()
        for index, raw_item in enumerate(raw_items):
            item = _normalize_speech_item(
                raw_item,
                factions_snapshot=factions_snapshot,
                rng=self._rng,
            )
            if item is None:
                continue

            event = self._event_from_speech_item(
                room_id=room_id,
                epoch=epoch,
                turn=turn,
                item=item,
                index=index,
                source=source,
                created_at_ms=generated_at_ms,
                id_prefix="settlement",
            )
            await self._repos.events.append(event)
            dumped = _dump_event(event)

            if item.kind == "public":
                output.ai_speak_events.append(dumped)
            elif item.kind == "private":
                message = self._message_from_private_event(event, index=index)
                await self._repos.messages.append_message(message)
                output.private_message_events.append(dumped)
            elif item.kind == "reaction":
                output.ai_reaction_events.append(dumped)
            else:
                output.narration_events.append(dumped)

        return output.to_bundle(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            generated_at_ms=generated_at_ms,
        )

    async def generate_ai_public_speech(
        self,
        room_id: str,
        faction_id: FactionId | str,
        *,
        context_hint: str = "",
    ) -> dict[str, Any]:
        current = await self._require_current_turn(room_id)
        faction = _coerce_faction_id(faction_id)
        content = _render_template(
            self._rng.choice(AI_SPEECH_TEMPLATES[faction]),
            faction=faction,
            target=_target_from_hint(context_hint, faction),
            epoch=current.epoch,
        )
        seq = self._repos.events.next_seq(room_id)
        event = self._build_event(
            id=f"ai-output:{room_id}:{current.epoch}:{current.turn}:public:{faction.value}:{seq}",
            room_id=room_id,
            epoch=current.epoch,
            turn=current.turn,
            kind=EventKind.speech,
            actor_faction=faction,
            target_faction=None,
            target_event_id=None,
            content=content,
            source="template",
            speech_kind="public",
            visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            created_at_ms=self._clock.now_ms(),
        )
        await self._repos.events.append(event)
        return _dump_event(event)

    async def generate_ai_private_messages(
        self,
        room_id: str,
        faction_id: FactionId | str,
        target_factions: list[FactionId | str],
        *,
        context_hint: str = "",
    ) -> list[dict[str, Any]]:
        current = await self._require_current_turn(room_id)
        faction = _coerce_faction_id(faction_id)
        targets = [_coerce_faction_id(target) for target in target_factions]
        generated: list[dict[str, Any]] = []
        for index, target in enumerate(targets):
            if target == faction:
                continue
            content = _render_template(
                self._rng.choice(AI_PRIVATE_TEMPLATES[faction]),
                faction=faction,
                target=target,
                epoch=current.epoch,
            )
            if context_hint:
                content = _with_context_hint(content, context_hint)

            seq = self._repos.events.next_seq(room_id)
            event = self._build_event(
                id=(
                    f"ai-output:{room_id}:{current.epoch}:{current.turn}:"
                    f"private:{faction.value}:{target.value}:{seq}"
                ),
                room_id=room_id,
                epoch=current.epoch,
                turn=current.turn,
                kind=EventKind.private,
                actor_faction=faction,
                target_faction=target,
                target_event_id=None,
                content=content,
                source="template",
                speech_kind="private",
                visibility=MessageVisibility(
                    scope=VisibilityScope.faction_pair,
                    faction_ids=[faction, target],
                ),
                created_at_ms=self._clock.now_ms(),
            )
            await self._repos.events.append(event)
            await self._repos.messages.append_message(
                MessageRecord(
                    id=f"{event.id}:message:{index}",
                    room_id=room_id,
                    epoch=current.epoch,
                    turn=current.turn,
                    phase=GamePhase.resolve,
                    from_faction=faction,
                    to_factions=[target],
                    visibility=event.visibility,
                    content=content,
                    created_at_ms=event.created_at_ms,
                )
            )
            generated.append(_dump_event(event))
        return generated

    async def _recent_events(self, room_id: str) -> list[GameEvent]:
        events = await self._repos.events.list_all(room_id)
        return sorted(
            events,
            key=lambda event: (event.created_at_ms, event.epoch, event.turn, event.id),
            reverse=True,
        )[:20]

    async def _require_current_turn(self, room_id: str):
        current = await self._repos.state.get_current_turn(room_id)
        if current is None:
            raise DiplomacyError(f"current turn not found for room {room_id}")
        return current

    def _event_from_speech_item(
        self,
        *,
        room_id: str,
        epoch: int,
        turn: int,
        item: AISpeechItem,
        index: int,
        source: str,
        created_at_ms: int,
        id_prefix: str,
    ) -> GameEvent:
        visibility = _visibility_for_item(item)
        target_event_id = item.target_event_id
        if item.kind == "reaction" and target_event_id is None:
            target_event_id = f"{id_prefix}:{room_id}:{epoch}:{turn}:ai-output:{index}"
        return self._build_event(
            id=f"{id_prefix}:{room_id}:{epoch}:{turn}:ai-output:{index}",
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            kind=_event_kind_for_item(item),
            actor_faction=None if item.kind == "narration" else item.faction_id,
            target_faction=item.target_faction,
            target_event_id=target_event_id,
            content=item.content,
            source=source,
            speech_kind=item.kind,
            visibility=visibility,
            created_at_ms=created_at_ms,
        )

    def _build_event(
        self,
        *,
        id: str,
        room_id: str,
        epoch: int,
        turn: int,
        kind: EventKind,
        actor_faction: FactionId | None,
        target_faction: FactionId | None,
        target_event_id: str | None,
        content: str,
        source: str,
        speech_kind: _SpeechKind,
        visibility: MessageVisibility,
        created_at_ms: int,
    ) -> GameEvent:
        payload: dict[str, Any] = {
            "source": source,
            "kind": speech_kind,
            "content": content,
        }
        if target_faction is not None:
            payload["target_faction"] = target_faction
        if target_event_id is not None:
            payload["target_event_id"] = target_event_id
        return GameEvent(
            id=id,
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            phase=GamePhase.resolve,
            created_at_ms=created_at_ms,
            priority=EventPriority.P1,
            kind=kind,
            actor_faction=actor_faction,
            target_faction=target_faction,
            payload=payload,
            narration=content,
            visibility=visibility,
        )

    def _message_from_private_event(self, event: GameEvent, *, index: int) -> MessageRecord:
        if event.actor_faction is None:
            raise DiplomacyError("private AI event must have actor_faction")
        return MessageRecord(
            id=f"{event.id}:message:{index}",
            room_id=event.room_id,
            epoch=event.epoch,
            turn=event.turn,
            phase=GamePhase.resolve,
            from_faction=event.actor_faction,
            to_factions=[event.target_faction] if event.target_faction is not None else [],
            visibility=event.visibility,
            content=event.narration,
            created_at_ms=event.created_at_ms,
        )


def fallback_generate(
    factions_snapshot: list[FactionState],
    recent_events: list[GameEvent],
    *,
    rng: Random,
) -> list[dict[str, Any]]:
    factions = [faction.id for faction in sorted(factions_snapshot, key=lambda item: str(item.id))]
    if not factions:
        factions = list(FactionId)

    conflict_score, cooperation_score = _event_tone_scores(recent_events)
    count = min(len(factions), rng.randint(1, 3))
    selected_factions = rng.sample(factions, k=count)
    generated: list[dict[str, Any]] = []
    for faction in selected_factions:
        target = _choose_target(faction, factions, rng)
        if conflict_score > cooperation_score:
            kind: _SpeechKind = "reaction" if rng.random() < 0.65 else "public"
            template_pool = (
                AI_REACTION_TEMPLATES[faction]
                if kind == "reaction"
                else AI_SPEECH_TEMPLATES[faction]
            )
        else:
            kind = "public"
            template_pool = AI_SPEECH_TEMPLATES[faction]
        generated.append(
            {
                "faction_id": faction,
                "kind": kind,
                "content": _render_template(
                    rng.choice(template_pool),
                    faction=faction,
                    target=target,
                    epoch=1,
                ),
                "target_faction": target,
            }
        )
    return generated


class _MutableOutput:
    def __init__(self) -> None:
        self.ai_speak_events: list[dict[str, Any]] = []
        self.ai_reaction_events: list[dict[str, Any]] = []
        self.private_message_events: list[dict[str, Any]] = []
        self.narration_events: list[dict[str, Any]] = []

    def to_bundle(
        self,
        *,
        room_id: str,
        epoch: int,
        turn: int,
        generated_at_ms: int,
    ) -> AIOutputBundle:
        return AIOutputBundle(
            room_id=room_id,
            epoch=epoch,
            turn=turn,
            generated_at_ms=generated_at_ms,
            ai_speak_events=self.ai_speak_events,
            ai_reaction_events=self.ai_reaction_events,
            private_message_events=self.private_message_events,
            narration_events=self.narration_events,
        )


def _normalize_speech_item(
    raw_item: AISpeechItem | dict[str, Any],
    *,
    factions_snapshot: list[FactionState],
    rng: Random,
) -> AISpeechItem | None:
    data = raw_item.model_dump() if isinstance(raw_item, BaseModel) else dict(raw_item)
    try:
        faction_id = _coerce_faction_id(data.get("faction_id"))
    except (TypeError, ValueError):
        faction_id = _choose_any_faction(factions_snapshot, rng)
    if faction_id is None:
        return None

    kind = data.get("kind")
    if kind not in {"public", "private", "reaction", "narration"}:
        kind = "public"

    target = data.get("target_faction")
    try:
        target_faction = _coerce_faction_id(target) if target is not None else None
    except (TypeError, ValueError):
        target_faction = None
    if kind == "private" and target_faction is None:
        target_faction = _choose_target(
            faction_id,
            [faction.id for faction in factions_snapshot] or list(FactionId),
            rng,
        )

    content = str(data.get("content") or "").strip()
    if not content:
        content = _fallback_content(
            faction_id=faction_id,
            kind=kind,
            target_faction=target_faction,
            rng=rng,
        )

    return AISpeechItem(
        faction_id=faction_id,
        kind=kind,
        content=content[:400],
        target_faction=target_faction,
        target_event_id=str(data["target_event_id"]) if data.get("target_event_id") else None,
    )


def _fallback_content(
    *,
    faction_id: FactionId,
    kind: str,
    target_faction: FactionId | None,
    rng: Random,
) -> str:
    target = target_faction or _choose_target(faction_id, list(FactionId), rng)
    if kind == "private":
        pool = AI_PRIVATE_TEMPLATES[faction_id]
    elif kind == "reaction":
        pool = AI_REACTION_TEMPLATES[faction_id]
    elif kind == "narration":
        return _render_template(
            rng.choice(SYSTEM_NARRATION_TEMPLATES),
            faction=faction_id,
            target=target,
            epoch=1,
        )
    else:
        pool = AI_SPEECH_TEMPLATES[faction_id]
    return _render_template(rng.choice(pool), faction=faction_id, target=target, epoch=1)


def _event_kind_for_item(item: AISpeechItem) -> EventKind:
    if item.kind == "public":
        return EventKind.speech
    if item.kind == "private":
        return EventKind.private
    if item.kind == "narration":
        return EventKind.narration
    return EventKind.ai_reaction


def _visibility_for_item(item: AISpeechItem) -> MessageVisibility:
    if item.kind == "private" and item.target_faction is not None:
        return MessageVisibility(
            scope=VisibilityScope.faction_pair,
            faction_ids=[item.faction_id, item.target_faction],
        )
    if item.kind == "private":
        return MessageVisibility(scope=VisibilityScope.self, faction_ids=[item.faction_id])
    return MessageVisibility(scope=VisibilityScope.public, faction_ids=[])


def _event_tone_scores(events: list[GameEvent]) -> tuple[int, int]:
    conflict_score = 0
    cooperation_score = 0
    for event in events:
        if event.kind in _CONFLICT_EVENT_KINDS:
            conflict_score += 2
        if event.kind in _COOP_EVENT_KINDS:
            cooperation_score += 2
        narration = event.narration.lower()
        conflict_score += sum(1 for word in _CONFLICT_WORDS if word in narration)
        cooperation_score += sum(1 for word in _COOP_WORDS if word in narration)
    return conflict_score, cooperation_score


def _choose_any_faction(factions_snapshot: list[FactionState], rng: Random) -> FactionId | None:
    if factions_snapshot:
        return rng.choice([faction.id for faction in factions_snapshot])
    return rng.choice(list(FactionId))


def _choose_target(faction_id: FactionId, factions: list[FactionId], rng: Random) -> FactionId:
    candidates = [candidate for candidate in factions if candidate != faction_id]
    if not candidates:
        candidates = [candidate for candidate in FactionId if candidate != faction_id]
    return rng.choice(candidates)


def _target_from_hint(context_hint: str, faction_id: FactionId) -> FactionId:
    lowered = context_hint.lower()
    for candidate in FactionId:
        if candidate != faction_id and candidate.value.lower() in lowered:
            return candidate
    return _choose_default_target(faction_id)


def _choose_default_target(faction_id: FactionId) -> FactionId:
    for candidate in FactionId:
        if candidate != faction_id:
            return candidate
    return faction_id


def _render_template(
    template: str,
    *,
    faction: FactionId,
    target: FactionId | None,
    epoch: int,
) -> str:
    target_label = FACTION_LABELS.get(target, str(target)) if target is not None else "各方"
    return template.format(
        faction=FACTION_LABELS.get(faction, str(faction)),
        target=target_label,
        epoch=epoch,
    )


def _with_context_hint(content: str, context_hint: str) -> str:
    hint = context_hint.strip()
    if not hint:
        return content
    suffix = f"关于{hint}, 我们可以私下处理。"
    return f"{content} {suffix}"[:400]


def _coerce_faction_id(value: FactionId | str | object) -> FactionId:
    if isinstance(value, FactionId):
        return value
    if isinstance(value, str):
        return FactionId(value)
    raise TypeError("faction_id must be a FactionId or string")


def _dump_event(event: GameEvent) -> dict[str, Any]:
    return event.model_dump(mode="json")
