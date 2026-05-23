from __future__ import annotations

import ast
from collections.abc import Awaitable, Callable
from pathlib import Path

import pytest

from app.core.clock import FrozenClock
from app.core.errors import InvalidActionError, InvalidPhaseError, RateLimitedError
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    TerrainKind,
    TreatyKind,
    VisibilityScope,
)
from app.domain.models import EpochTurn, GameEvent, GameRoom, MapRegion, MessageVisibility, Player
from app.repositories.factory import Repositories, make_repositories
from app.services.action_service import ActionAck, ActionService


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(10_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


@pytest.fixture()
def service(repos: Repositories, clock: FrozenClock) -> ActionService:
    return ActionService(repos, clock)


def _player(
    *,
    player_id: str = "player-1",
    room_id: str = "room-1",
    faction_id: FactionId = FactionId.ironCrown,
) -> Player:
    return Player(
        id=player_id,
        room_id=room_id,
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=faction_id,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


def _room(
    *,
    room_id: str = "room-1",
    player: Player | None = None,
    status: RoomStatus = RoomStatus.running,
    phase: GamePhase = GamePhase.action,
) -> GameRoom:
    player = player or _player(room_id=room_id)
    return GameRoom(
        id=room_id,
        status=status,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[faction_id for faction_id in FactionId if faction_id != player.faction_id],
        current=EpochTurn(
            epoch=1,
            turn=2,
            phase=phase,
            arbitrate_phase=None,
            phase_started_at_ms=9000,
            phase_duration_ms=30_000,
        ),
        seed=42,
    )


def _region(region_id: str) -> MapRegion:
    return MapRegion(
        id=region_id,
        owner=FactionId.ironCrown,
        resource_value=1.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(0.0, 0.0),
        min_garrison=1,
        supply_lines=1,
    )


async def _seed_room(
    repos: Repositories,
    *,
    phase: GamePhase = GamePhase.action,
) -> tuple[GameRoom, Player]:
    player = _player()
    room = _room(player=player, phase=phase)
    await repos.rooms.create(room)
    await repos.players.upsert(player)
    await repos.state.save_regions(room.id, [_region("r-1"), _region("r-2")])
    return room, player


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "call",
    [
        lambda svc, room, player: svc.record_speech(
            room_id=room.id,
            player_id=player.id,
            content="hello",
            targets=[FactionId.starlight],
            request_id="req-speech",
        ),
        lambda svc, room, player: svc.record_private_message(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.starlight,
            content="secret",
            request_id="req-private",
        ),
        lambda svc, room, player: svc.record_treaty_request(
            room_id=room.id,
            player_id=player.id,
            treaty_kind=TreatyKind.trade,
            target_factions=[FactionId.starlight],
            proposal_text="trade route",
            request_id="req-treaty",
        ),
        lambda svc, room, player: svc.record_military_order(
            room_id=room.id,
            player_id=player.id,
            source_region="r-1",
            target_region="r-2",
            movement="attack",
            orders_text="advance",
            troops=10,
            request_id="req-military",
        ),
        lambda svc, room, player: svc.record_intel_action(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.starlight,
            intel_kind="spy",
            brief="watch border",
            request_id="req-intel",
        ),
        lambda svc, room, player: svc.record_lock_action(
            room_id=room.id,
            player_id=player.id,
            request_id="req-lock",
        ),
    ],
)
async def test_phase_must_be_action_for_all_record_methods(
    repos: Repositories,
    service: ActionService,
    call: Callable[[ActionService, GameRoom, Player], Awaitable[ActionAck]],
) -> None:
    room, player = await _seed_room(repos, phase=GamePhase.resolve)

    with pytest.raises(InvalidPhaseError):
        await call(service, room, player)


@pytest.mark.asyncio
async def test_speech_content_over_400_raises_invalid_action(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_speech(
            room_id=room.id,
            player_id=player.id,
            content="x" * 401,
            targets=[FactionId.starlight],
            request_id="req-1",
        )


@pytest.mark.asyncio
async def test_speech_targets_must_not_include_actor(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_speech(
            room_id=room.id,
            player_id=player.id,
            content="hello",
            targets=[FactionId.ironCrown],
            request_id="req-1",
        )


@pytest.mark.asyncio
async def test_private_target_faction_must_not_equal_actor(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_private_message(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.ironCrown,
            content="secret",
            request_id="req-1",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "target_factions",
    [[], [FactionId.starlight, FactionId.emerald, FactionId.ashen, FactionId.aurora]],
)
async def test_treaty_target_factions_length_must_be_1_to_3(
    repos: Repositories,
    service: ActionService,
    target_factions: list[FactionId],
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_treaty_request(
            room_id=room.id,
            player_id=player.id,
            treaty_kind=TreatyKind.trade,
            target_factions=target_factions,
            proposal_text="proposal",
            request_id="req-1",
        )


@pytest.mark.asyncio
async def test_speech_private_combined_sixth_action_is_rate_limited(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    for index in range(3):
        await service.record_speech(
            room_id=room.id,
            player_id=player.id,
            content=f"speech {index}",
            targets=[FactionId.starlight],
            request_id=f"req-speech-{index}",
        )
    for index in range(2):
        await service.record_private_message(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.starlight,
            content=f"private {index}",
            request_id=f"req-private-{index}",
        )

    with pytest.raises(RateLimitedError):
        await service.record_speech(
            room_id=room.id,
            player_id=player.id,
            content="sixth",
            targets=[FactionId.starlight],
            request_id="req-sixth",
        )


@pytest.mark.asyncio
async def test_treaty_fourth_action_is_rate_limited(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    for index in range(3):
        await service.record_treaty_request(
            room_id=room.id,
            player_id=player.id,
            treaty_kind=TreatyKind.trade,
            target_factions=[FactionId.starlight],
            proposal_text=f"proposal {index}",
            request_id=f"req-treaty-{index}",
        )

    with pytest.raises(RateLimitedError):
        await service.record_treaty_request(
            room_id=room.id,
            player_id=player.id,
            treaty_kind=TreatyKind.trade,
            target_factions=[FactionId.starlight],
            proposal_text="proposal 4",
            request_id="req-treaty-4",
        )


@pytest.mark.asyncio
async def test_intel_second_action_is_rate_limited(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    await service.record_intel_action(
        room_id=room.id,
        player_id=player.id,
        target_faction=FactionId.starlight,
        intel_kind="spy",
        brief="watch border",
        request_id="req-intel-1",
    )

    with pytest.raises(RateLimitedError):
        await service.record_intel_action(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.starlight,
            intel_kind="intercept",
            brief="watch envoy",
            request_id="req-intel-2",
        )


@pytest.mark.asyncio
async def test_lock_second_action_is_rate_limited(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    await service.record_lock_action(room_id=room.id, player_id=player.id, request_id="req-lock-1")

    with pytest.raises(RateLimitedError):
        await service.record_lock_action(
            room_id=room.id,
            player_id=player.id,
            request_id="req-lock-2",
        )


@pytest.mark.asyncio
async def test_normal_call_appends_action_and_returns_complete_ack(
    repos: Repositories,
    service: ActionService,
    clock: FrozenClock,
) -> None:
    room, player = await _seed_room(repos)
    clock.set_ms(12_345)

    ack = await service.record_speech(
        room_id=room.id,
        player_id=player.id,
        content="  hello world  ",
        targets=["*"],
        request_id="req-1",
    )
    actions = await repos.actions.list_by_turn(room.id, room.current.epoch, room.current.turn)

    assert ack.request_id == "req-1"
    assert ack.accepted is True
    assert ack.action_id is not None
    assert ack.reason is None
    assert ack.server_ts == 12_345
    assert ack.seq == 2
    assert len(actions) == 1
    assert actions[0].id == ack.action_id
    assert actions[0].visibility.scope == VisibilityScope.public
    assert actions[0].content == "hello world"
    assert FactionId.ironCrown not in actions[0].targets


@pytest.mark.asyncio
async def test_p0_speech_events_get_cinematic_hint_while_p1_does_not(
    repos: Repositories,
    service: ActionService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    room, player = await _seed_room(repos)

    def _fake_derive(action: object, regions: object | None = None) -> list[GameEvent]:
        del action, regions
        return [
            GameEvent(
                id="event-p0",
                room_id=room.id,
                epoch=room.current.epoch,
                turn=room.current.turn,
                phase=GamePhase.resolve,
                created_at_ms=10_000,
                priority=EventPriority.P0,
                kind=EventKind.speech,
                actor_faction=player.faction_id,
                target_faction=None,
                payload={"action_id": "action-p0", "content": "speech p0"},
                narration="speech p0",
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            ),
            GameEvent(
                id="event-p1",
                room_id=room.id,
                epoch=room.current.epoch,
                turn=room.current.turn,
                phase=GamePhase.resolve,
                created_at_ms=10_001,
                priority=EventPriority.P1,
                kind=EventKind.speech,
                actor_faction=player.faction_id,
                target_faction=None,
                payload={"action_id": "action-p1", "content": "speech p1"},
                narration="speech p1",
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            ),
        ]

    monkeypatch.setattr("app.services.action_service.derive_events_from_action", _fake_derive)

    await service.record_speech(
        room_id=room.id,
        player_id=player.id,
        content="hello",
        targets=[FactionId.starlight],
        request_id="req-speech",
    )

    events = await repos.events.list_by_turn(room.id, room.current.epoch, room.current.turn)

    assert [event.payload.get("cinematic_hint") for event in events] == ["speech", None]
    assert events[0].priority == EventPriority.P0
    assert events[1].priority == EventPriority.P1


@pytest.mark.asyncio
async def test_speech_private_and_treaty_write_message_records(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    await service.record_speech(
        room_id=room.id,
        player_id=player.id,
        content="public",
        targets=[FactionId.starlight],
        request_id="req-speech",
    )
    await service.record_private_message(
        room_id=room.id,
        player_id=player.id,
        target_faction=FactionId.emerald,
        content="private",
        request_id="req-private",
    )
    await service.record_treaty_request(
        room_id=room.id,
        player_id=player.id,
        treaty_kind=TreatyKind.alliance,
        target_factions=[FactionId.starlight, FactionId.emerald],
        proposal_text="alliance proposal",
        request_id="req-treaty",
    )

    messages = await repos.messages.list_by_turn(room.id, room.current.epoch, room.current.turn)

    assert [message.content for message in messages] == ["public", "private", "alliance proposal"]
    assert [message.visibility.scope for message in messages] == [
        VisibilityScope.public,
        VisibilityScope.faction_pair,
        VisibilityScope.faction_set,
    ]
    assert messages[1].to_factions == [FactionId.emerald]
    assert messages[2].to_factions == [FactionId.starlight, FactionId.emerald]


@pytest.mark.asyncio
async def test_military_field_validation(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_military_order(
            room_id=room.id,
            player_id=player.id,
            source_region="r-1",
            target_region="r-2",
            movement="march",
            orders_text="advance",
            troops=10,
            request_id="req-bad-move",
        )

    with pytest.raises(InvalidActionError):
        await service.record_military_order(
            room_id=room.id,
            player_id=player.id,
            source_region="missing",
            target_region="r-2",
            movement="attack",
            orders_text="advance",
            troops=10,
            request_id="req-bad-region",
        )

    with pytest.raises(InvalidActionError):
        await service.record_military_order(
            room_id=room.id,
            player_id=player.id,
            source_region="r-1",
            target_region="r-2",
            movement="attack",
            orders_text="advance",
            troops=0,
            request_id="req-bad-troops",
        )


@pytest.mark.asyncio
async def test_intel_field_validation(
    repos: Repositories,
    service: ActionService,
) -> None:
    room, player = await _seed_room(repos)

    with pytest.raises(InvalidActionError):
        await service.record_intel_action(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.ironCrown,
            intel_kind="spy",
            brief="watch",
            request_id="req-self",
        )

    with pytest.raises(InvalidActionError):
        await service.record_intel_action(
            room_id=room.id,
            player_id=player.id,
            target_faction=FactionId.starlight,
            intel_kind="listen",
            brief="watch",
            request_id="req-kind",
        )


def test_action_service_does_not_import_llm() -> None:
    source = Path("app/services/action_service.py").read_text(encoding="utf-8")
    test_source = Path("app/tests/test_action_service.py").read_text(encoding="utf-8")
    prohibited_module = "app" + ".llm"

    for parsed_source in (ast.parse(source), ast.parse(test_source)):
        for node in ast.walk(parsed_source):
            if isinstance(node, ast.Import):
                assert all(alias.name != prohibited_module for alias in node.names)
            if isinstance(node, ast.ImportFrom):
                assert node.module != prohibited_module

    assert prohibited_module not in source
