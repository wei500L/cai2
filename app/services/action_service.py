from __future__ import annotations

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel

from app.core.clock import Clock
from app.core.errors import (
    InvalidActionError,
    InvalidPhaseError,
    PlayerNotFoundError,
    RateLimitedError,
    RoomNotFoundError,
)
from app.core.ids import new_message_id
from app.domain.enums import FactionId, GamePhase, RoomStatus, TreatyKind, VisibilityScope
from app.domain.models import (
    GameAction,
    GameRoom,
    IntelAction,
    LockAction,
    MessageVisibility,
    MilitaryAction,
    Player,
    PrivateMessageAction,
    SpeechAction,
    TreatyAction,
)
from app.game.visibility import derive_events_from_action
from app.repositories.base import MessageRecord
from app.repositories.factory import Repositories

ActionMode = Literal["speech", "private", "treaty", "military", "intel", "lock"]
Movement = Literal["move", "attack", "defend"]
IntelKind = Literal["spy", "interrogate", "intercept"]

_SPEECH_ALL_TARGETS = "*"
_MAX_CONTENT_LENGTH = 400


class ActionAck(BaseModel):
    request_id: str
    accepted: bool
    action_id: str | None = None
    reason: str | None = None
    server_ts: int
    seq: int


class ActionService:
    def __init__(
        self,
        repos: Repositories,
        clock: Clock,
        *,
        max_speech_private_per_turn: int = 5,
        max_treaty: int = 3,
        max_military: int = 3,
        max_intel: int = 1,
    ) -> None:
        self._repos = repos
        self._clock = clock
        self._max_speech_private_per_turn = max_speech_private_per_turn
        self._max_treaty = max_treaty
        self._max_military = max_military
        self._max_intel = max_intel

    async def record_speech(
        self,
        *,
        room_id: str,
        player_id: str,
        content: str,
        targets: list[FactionId | str],
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_speech_private_quota(room, player.id)

        content = _validate_content(content, field_name="content")
        targets = _validate_speech_targets(targets, actor_faction)
        visibility = MessageVisibility(scope=VisibilityScope.public, faction_ids=[])
        action = SpeechAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="speech",
            content=content,
            targets=targets,
        )
        await self._record_action(action)
        await self._record_message(action, content=content, to_factions=targets)
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def record_private_message(
        self,
        *,
        room_id: str,
        player_id: str,
        target_faction: FactionId | str,
        content: str,
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_speech_private_quota(room, player.id)

        content = _validate_content(content, field_name="content")
        target_faction = _validate_target_faction(target_faction, actor_faction)
        visibility = MessageVisibility(
            scope=VisibilityScope.faction_pair,
            faction_ids=[actor_faction, target_faction],
        )
        action = PrivateMessageAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="private",
            content=content,
            target_faction=target_faction,
        )
        await self._record_action(action)
        await self._record_message(action, content=content, to_factions=[target_faction])
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def record_treaty_request(
        self,
        *,
        room_id: str,
        player_id: str,
        treaty_kind: TreatyKind | str,
        target_factions: list[FactionId | str],
        proposal_text: str,
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_mode_quota(room, player.id, "treaty", self._max_treaty)

        treaty_kind = _validate_treaty_kind(treaty_kind)
        target_factions = _validate_treaty_targets(target_factions, actor_faction)
        proposal_text = _validate_content(proposal_text, field_name="proposal_text")
        visibility = MessageVisibility(
            scope=VisibilityScope.faction_set,
            faction_ids=[actor_faction, *target_factions],
        )
        action = TreatyAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="treaty",
            treaty_kind=treaty_kind,
            target_factions=target_factions,
            proposal_text=proposal_text,
        )
        await self._record_action(action)
        await self._record_message(action, content=proposal_text, to_factions=target_factions)
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def record_military_order(
        self,
        *,
        room_id: str,
        player_id: str,
        source_region: str,
        target_region: str,
        movement: str,
        orders_text: str,
        troops: int | None,
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_mode_quota(room, player.id, "military", self._max_military)

        source_region, target_region = await self._validate_military_regions(
            room.id,
            source_region,
            target_region,
        )
        movement = _validate_movement(movement)
        orders_text = _validate_content(orders_text, field_name="orders_text")
        troops = _validate_troops(troops)
        visibility = MessageVisibility(scope=VisibilityScope.self, faction_ids=[actor_faction])
        action = MilitaryAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="military",
            source_region=source_region,
            target_region=target_region,
            movement=movement,
            orders_text=orders_text,
            troops=troops,
        )
        await self._record_action(action)
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def record_intel_action(
        self,
        *,
        room_id: str,
        player_id: str,
        target_faction: FactionId | str,
        intel_kind: str,
        brief: str,
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_mode_quota(room, player.id, "intel", self._max_intel)

        target_faction = _validate_target_faction(target_faction, actor_faction)
        intel_kind = _validate_intel_kind(intel_kind)
        brief = _validate_content(brief, field_name="brief")
        visibility = MessageVisibility(scope=VisibilityScope.self, faction_ids=[actor_faction])
        action = IntelAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="intel",
            target_faction=target_faction,
            intel_kind=intel_kind,
            brief=brief,
        )
        await self._record_action(action)
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def record_lock_action(
        self,
        *,
        room_id: str,
        player_id: str,
        request_id: str,
    ) -> ActionAck:
        room, player, actor_faction = await self._load_action_context(room_id, player_id)
        await self._require_mode_quota(room, player.id, "lock", 1)

        visibility = MessageVisibility(scope=VisibilityScope.self, faction_ids=[actor_faction])
        action = LockAction(
            **self._base_action_payload(room, player, actor_faction, visibility),
            mode="lock",
        )
        await self._record_action(action)
        return self._ack(request_id=request_id, action_id=action.id, room_id=room.id)

    async def _load_action_context(
        self,
        room_id: str,
        player_id: str,
    ) -> tuple[GameRoom, Player, FactionId]:
        room = await self._repos.rooms.get(room_id)
        if room is None:
            raise RoomNotFoundError(f"room {room_id} not found")

        player = await self._repos.players.get(player_id)
        if player is None:
            raise PlayerNotFoundError(f"player {player_id} not found")

        player_in_room = any(candidate.id == player.id for candidate in room.players)
        if player.room_id != room.id or not player_in_room:
            raise InvalidActionError(f"player {player_id} does not belong to room {room_id}")

        if room.status != RoomStatus.running:
            raise InvalidPhaseError(f"room {room_id} is not running")

        if room.current.phase != GamePhase.action:
            raise InvalidPhaseError(f"room {room_id} is not in action phase")

        if player.faction_id is None:
            raise InvalidActionError("player must select a faction before recording actions")

        return room, player, player.faction_id

    async def _require_speech_private_quota(self, room: GameRoom, player_id: str) -> None:
        speech_count = await self._repos.actions.count_by_player_turn(
            room.id,
            player_id,
            room.current.epoch,
            room.current.turn,
            "speech",
        )
        private_count = await self._repos.actions.count_by_player_turn(
            room.id,
            player_id,
            room.current.epoch,
            room.current.turn,
            "private",
        )
        if speech_count + private_count >= self._max_speech_private_per_turn:
            raise RateLimitedError("speech/private action limit reached for this turn")

    async def _require_mode_quota(
        self,
        room: GameRoom,
        player_id: str,
        mode: ActionMode,
        limit: int,
    ) -> None:
        count = await self._repos.actions.count_by_player_turn(
            room.id,
            player_id,
            room.current.epoch,
            room.current.turn,
            mode,
        )
        if count >= limit:
            raise RateLimitedError(f"{mode} action limit reached for this turn")

    async def _validate_military_regions(
        self,
        room_id: str,
        source_region: str,
        target_region: str,
    ) -> tuple[str, str]:
        source_region = _validate_non_empty_text(source_region, field_name="source_region")
        target_region = _validate_non_empty_text(target_region, field_name="target_region")
        regions = await self._repos.state.get_regions(room_id)
        region_ids = {region.id for region in regions}
        if source_region not in region_ids:
            raise InvalidActionError(f"source_region {source_region} does not exist")
        if target_region not in region_ids:
            raise InvalidActionError(f"target_region {target_region} does not exist")
        return source_region, target_region

    def _base_action_payload(
        self,
        room: GameRoom,
        player: Player,
        actor_faction: FactionId,
        visibility: MessageVisibility,
    ) -> dict[str, object]:
        return {
            "id": _new_action_id(),
            "room_id": room.id,
            "epoch": room.current.epoch,
            "turn": room.current.turn,
            "phase": room.current.phase,
            "actor_player_id": player.id,
            "actor_faction": actor_faction,
            "created_at_ms": self._clock.now_ms(),
            "visibility": visibility,
        }

    async def _record_action(self, action: GameAction) -> None:
        await self._repos.actions.append(action)
        await self._emit_outbound_events(action)

    async def _emit_outbound_events(self, action: GameAction) -> None:
        regions = None
        if action.mode == "military":
            regions = await self._repos.state.get_regions(action.room_id)

        for event in derive_events_from_action(action, regions=regions):
            await self._repos.events.append(event)

    async def _record_message(
        self,
        action: SpeechAction | PrivateMessageAction | TreatyAction,
        *,
        content: str,
        to_factions: list[FactionId],
    ) -> None:
        message = MessageRecord(
            id=new_message_id(),
            room_id=action.room_id,
            epoch=action.epoch,
            turn=action.turn,
            phase=action.phase,
            from_faction=action.actor_faction,
            to_factions=to_factions,
            visibility=action.visibility,
            content=content,
            created_at_ms=action.created_at_ms,
        )
        await self._repos.messages.append_message(message)

    def _ack(self, *, request_id: str, action_id: str, room_id: str) -> ActionAck:
        return ActionAck(
            request_id=request_id,
            accepted=True,
            action_id=action_id,
            reason=None,
            server_ts=self._clock.now_ms(),
            seq=self._repos.events.next_seq(room_id),
        )


def _new_action_id() -> str:
    return f"act_{uuid4().hex[:12]}"


def _validate_content(value: str, *, field_name: str) -> str:
    value = _validate_non_empty_text(value, field_name=field_name)
    if len(value) > _MAX_CONTENT_LENGTH:
        raise InvalidActionError(f"{field_name} must be at most {_MAX_CONTENT_LENGTH} characters")
    return value


def _validate_non_empty_text(value: str, *, field_name: str) -> str:
    if not isinstance(value, str):
        raise InvalidActionError(f"{field_name} must be a string")
    value = value.strip()
    if not value:
        raise InvalidActionError(f"{field_name} must not be empty")
    return value


def _validate_speech_targets(
    targets: list[FactionId | str],
    actor_faction: FactionId,
) -> list[FactionId]:
    if targets == [_SPEECH_ALL_TARGETS]:
        return [faction_id for faction_id in FactionId if faction_id != actor_faction]

    target_factions = [_coerce_faction_id(target, field_name="targets") for target in targets]
    _require_no_self_target(target_factions, actor_faction, field_name="targets")
    return target_factions


def _validate_target_faction(
    target_faction: FactionId | str,
    actor_faction: FactionId,
) -> FactionId:
    target = _coerce_faction_id(target_faction, field_name="target_faction")
    if target == actor_faction:
        raise InvalidActionError("target_faction must not be actor faction")
    return target


def _validate_treaty_targets(
    target_factions: list[FactionId | str],
    actor_faction: FactionId,
) -> list[FactionId]:
    if not 1 <= len(target_factions) <= 3:
        raise InvalidActionError("target_factions must contain 1 to 3 factions")
    targets = [
        _coerce_faction_id(target, field_name="target_factions") for target in target_factions
    ]
    _require_no_self_target(targets, actor_faction, field_name="target_factions")
    return targets


def _validate_treaty_kind(treaty_kind: TreatyKind | str) -> TreatyKind:
    if isinstance(treaty_kind, TreatyKind):
        return treaty_kind
    try:
        return TreatyKind(treaty_kind)
    except ValueError as exc:
        raise InvalidActionError(f"unknown treaty_kind: {treaty_kind}") from exc


def _validate_movement(movement: str) -> Movement:
    if movement not in ("move", "attack", "defend"):
        raise InvalidActionError("movement must be one of: move, attack, defend")
    return movement  # type: ignore[return-value]


def _validate_troops(troops: int | None) -> int | None:
    if troops is None:
        return None
    if not isinstance(troops, int) or troops <= 0:
        raise InvalidActionError("troops must be greater than 0 or None")
    return troops


def _validate_intel_kind(intel_kind: str) -> IntelKind:
    if intel_kind not in ("spy", "interrogate", "intercept"):
        raise InvalidActionError("intel_kind must be one of: spy, interrogate, intercept")
    return intel_kind  # type: ignore[return-value]


def _coerce_faction_id(value: FactionId | str, *, field_name: str) -> FactionId:
    if isinstance(value, FactionId):
        return value
    try:
        return FactionId(value)
    except ValueError as exc:
        raise InvalidActionError(f"{field_name} contains unknown faction: {value}") from exc


def _require_no_self_target(
    targets: list[FactionId],
    actor_faction: FactionId,
    *,
    field_name: str,
) -> None:
    if actor_faction in targets:
        raise InvalidActionError(f"{field_name} must not contain actor faction")
