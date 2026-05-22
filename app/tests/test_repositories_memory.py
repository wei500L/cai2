from __future__ import annotations

import asyncio

import pytest

from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    GamePhase,
    PlayerKind,
    RoomStatus,
    VisibilityScope,
)
from app.domain.models import (
    EpochTurn,
    GameEvent,
    GameRoom,
    MessageVisibility,
    Player,
    SettlementResult,
    SpeechAction,
)
from app.repositories.base import MessageRecord
from app.repositories.factory import Repositories, make_repositories
from app.repositories.memory import (
    MemoryActionLogRepository,
    MemoryEventLogRepository,
    MemoryMessageLogRepository,
    MemoryPlayerRepository,
    MemoryReplayRepository,
    MemoryRoomRepository,
    MemorySettlementRepository,
)


def _turn(epoch: int = 1, turn: int = 1) -> EpochTurn:
    return EpochTurn(
        epoch=epoch,
        turn=turn,
        phase=GamePhase.action,
        arbitrate_phase=None,
        phase_started_at_ms=1000,
        phase_duration_ms=30_000,
    )


def _player(player_id: str = "player-1", room_id: str = "room-1") -> Player:
    return Player(
        id=player_id,
        room_id=room_id,
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1000,
    )


def _room(room_id: str = "room-1", status: RoomStatus = RoomStatus.lobby) -> GameRoom:
    return GameRoom(
        id=room_id,
        status=status,
        created_at_ms=1000,
        mode="solo_1v7",
        max_players=1,
        players=[_player(room_id=room_id)],
        ai_factions=[FactionId.starlight],
        current=_turn(),
        seed=42,
    )


def _visibility(
    scope: VisibilityScope = VisibilityScope.public,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


def _speech_action(
    action_id: str = "action-1",
    player_id: str = "player-1",
    epoch: int = 1,
    turn: int = 1,
) -> SpeechAction:
    return SpeechAction(
        id=action_id,
        room_id="room-1",
        epoch=epoch,
        turn=turn,
        phase=GamePhase.action,
        actor_player_id=player_id,
        actor_faction=FactionId.ironCrown,
        created_at_ms=1000,
        visibility=_visibility(),
        mode="speech",
        content=f"content-{action_id}",
        targets=[FactionId.starlight],
    )


def _message(
    message_id: str,
    visibility: MessageVisibility,
    to_factions: list[FactionId] | None = None,
) -> MessageRecord:
    return MessageRecord(
        id=message_id,
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.action,
        from_faction=FactionId.ironCrown,
        to_factions=to_factions or [],
        visibility=visibility,
        content=f"message-{message_id}",
        created_at_ms=1000,
    )


def _event(
    event_id: str,
    visibility: MessageVisibility,
    created_at_ms: int = 1000,
) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.resolve,
        created_at_ms=created_at_ms,
        priority=EventPriority.P1,
        kind=EventKind.narration,
        actor_faction=None,
        target_faction=None,
        payload={"id": event_id},
        narration=f"event-{event_id}",
        visibility=visibility,
    )


@pytest.mark.asyncio
async def test_room_crud_and_deep_copy() -> None:
    repo = MemoryRoomRepository()
    room = await repo.create(_room())

    assert room.id == "room-1"
    assert [active.id for active in await repo.list_active()] == ["room-1"]

    fetched = await repo.get("room-1")
    assert fetched is not None
    fetched.players[0].display_name = "mutated"

    refetched = await repo.get("room-1")
    assert refetched is not None
    assert refetched.players[0].display_name == "player-1"

    await repo.update(_room(status=RoomStatus.finished))
    assert await repo.list_active() == []

    await repo.delete("room-1")
    assert await repo.get("room-1") is None


@pytest.mark.asyncio
async def test_player_upsert_and_list_by_room() -> None:
    repo = MemoryPlayerRepository()
    await repo.upsert(_player("player-1", "room-1"))
    await repo.upsert(_player("player-2", "room-2"))

    players = await repo.list_by_room("room-1")

    assert [player.id for player in players] == ["player-1"]
    players[0].display_name = "mutated"
    stored = await repo.get("player-1")
    assert stored is not None
    assert stored.display_name == "player-1"


@pytest.mark.asyncio
async def test_action_append_list_and_count_by_player_turn() -> None:
    repo = MemoryActionLogRepository()
    await repo.append(_speech_action("action-1"))
    await repo.append(_speech_action("action-2", player_id="player-2"))
    await repo.append(_speech_action("action-3", epoch=1, turn=2))

    by_turn = await repo.list_by_turn("room-1", 1, 1)
    by_player = await repo.list_by_player("room-1", "player-1")
    count = await repo.count_by_player_turn("room-1", "player-1", 1, 1, "speech")

    assert [action.id for action in by_turn] == ["action-1", "action-2"]
    assert [action.id for action in by_player] == ["action-1", "action-3"]
    assert count == 1

    by_turn[0].content = "mutated"
    refetched = await repo.list_by_turn("room-1", 1, 1)
    assert refetched[0].content == "content-action-1"


@pytest.mark.asyncio
async def test_message_append_and_list_private_between() -> None:
    repo = MemoryMessageLogRepository()
    await repo.append_message(_message("public", _visibility()))
    await repo.append_message(
        _message(
            "private-1",
            _visibility(
                VisibilityScope.faction_pair,
                [FactionId.ironCrown, FactionId.starlight],
            ),
            [FactionId.starlight],
        )
    )
    await repo.append_message(
        _message(
            "private-2",
            _visibility(VisibilityScope.faction_pair, [FactionId.ironCrown, FactionId.emerald]),
            [FactionId.emerald],
        )
    )

    private_messages = await repo.list_private_between(
        "room-1",
        [FactionId.ironCrown, FactionId.starlight],
    )
    public_messages = await repo.list_public("room-1", epoch=1, turn=1)

    assert [message.id for message in private_messages] == ["private-1"]
    assert [message.id for message in public_messages] == ["public"]

    private_messages[0].content = "mutated"
    refetched = await repo.list_private_between("room-1", [FactionId.ironCrown, FactionId.starlight])
    assert refetched[0].content == "message-private-1"


@pytest.mark.asyncio
async def test_event_append_and_list_visible_to_faction() -> None:
    repo = MemoryEventLogRepository()
    await repo.append(_event("public", _visibility(), created_at_ms=900))
    await repo.append(
        _event(
            "visible",
            _visibility(VisibilityScope.faction_set, [FactionId.ironCrown, FactionId.starlight]),
            created_at_ms=1000,
        )
    )
    await repo.append(
        _event(
            "hidden",
            _visibility(VisibilityScope.self, [FactionId.emerald]),
            created_at_ms=1000,
        )
    )

    visible = await repo.list_visible_to_faction("room-1", FactionId.ironCrown, since_ms=950)
    by_turn = await repo.list_by_turn("room-1", 1, 1)

    assert [event.id for event in visible] == ["visible"]
    assert [event.id for event in by_turn] == ["public", "visible", "hidden"]

    by_turn[0].payload["changed"] = True
    refetched = await repo.list_all("room-1")
    assert "changed" not in refetched[0].payload


@pytest.mark.asyncio
async def test_settlement_save_get_and_list_by_room() -> None:
    repo = MemorySettlementRepository()
    result = SettlementResult(room_id="room-1", epoch=1, turn=1, generated_at_ms=2000)
    await repo.save(result)
    await repo.save(SettlementResult(room_id="room-2", epoch=1, turn=1, generated_at_ms=2000))

    stored = await repo.get("room-1", 1, 1)
    by_room = await repo.list_by_room("room-1")

    assert stored == result
    assert by_room == [result]

    assert stored is not None
    stored.ai_speeches.append({"not": "stored"})  # type: ignore[arg-type]
    refetched = await repo.get("room-1", 1, 1)
    assert refetched is not None
    assert refetched.ai_speeches == []


@pytest.mark.asyncio
async def test_replay_save_and_get_deep_copy() -> None:
    repo = MemoryReplayRepository()
    await repo.save_replay("room-1", {"events": [{"id": "event-1"}]})

    replay = await repo.get_replay("room-1")
    assert replay == {"events": [{"id": "event-1"}]}

    assert replay is not None
    replay["events"][0]["id"] = "mutated"
    refetched = await repo.get_replay("room-1")
    assert refetched == {"events": [{"id": "event-1"}]}


@pytest.mark.asyncio
async def test_concurrent_action_appends_are_counted() -> None:
    repo = MemoryActionLogRepository()

    async def append_one(index: int) -> None:
        await repo.append(_speech_action(f"action-{index}"))

    await asyncio.gather(*(append_one(index) for index in range(100)))

    assert await repo.count_by_player_turn("room-1", "player-1", 1, 1, "speech") == 100
    assert len(await repo.list_by_turn("room-1", 1, 1)) == 100


def test_make_repositories_memory_and_postgres_branch() -> None:
    repos = make_repositories("memory")

    assert isinstance(repos, Repositories)
    assert isinstance(repos.rooms, MemoryRoomRepository)
    assert isinstance(repos.players, MemoryPlayerRepository)

    with pytest.raises(NotImplementedError, match="待接入"):
        make_repositories("postgres")
