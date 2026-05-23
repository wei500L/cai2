from __future__ import annotations

import pytest

from app.core.clock import FrozenClock
from app.core.errors import InvalidPhaseError
from app.domain.enums import (
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    PlayerKind,
    RelationshipStatus,
    RoomStatus,
    TreatyKind,
    VisibilityScope,
)
from app.domain.factions import all_faction_ids
from app.domain.models import (
    EpochTurn,
    FactionStatChange,
    FactionState,
    GameEvent,
    GameRoom,
    MessageVisibility,
    Player,
    Relationship,
    SettlementResult,
    SpeechAction,
    TreatyAction,
    TreatyDecision,
)
from app.repositories.base import MessageRecord
from app.repositories.factory import Repositories, make_repositories
from app.services.replay_service import ReplayDTO, ReplayService


@pytest.fixture()
def clock() -> FrozenClock:
    return FrozenClock(900_000)


@pytest.fixture()
def repos() -> Repositories:
    return make_repositories("memory")


def _visibility(
    scope: VisibilityScope = VisibilityScope.public,
    faction_ids: list[FactionId] | None = None,
) -> MessageVisibility:
    return MessageVisibility(scope=scope, faction_ids=faction_ids or [])


def _player() -> Player:
    return Player(
        id="player-1",
        room_id="room-1",
        display_name="player-1",
        kind=PlayerKind.human,
        faction_id=FactionId.ironCrown,
        connected=True,
        joined_at_ms=1_000,
        ready=True,
    )


def _room(status: RoomStatus = RoomStatus.finished) -> GameRoom:
    player = _player()
    return GameRoom(
        id="room-1",
        status=status,
        created_at_ms=1_000,
        mode="solo_1v7",
        max_players=1,
        players=[player],
        ai_factions=[
            faction_id for faction_id in all_faction_ids() if faction_id != player.faction_id
        ],
        current=EpochTurn(
            epoch=3,
            turn=3,
            phase=GamePhase.arbitrate,
            arbitrate_phase=None,
            phase_started_at_ms=880_000,
            phase_duration_ms=30_000,
        ),
        seed=42,
    )


def _factions() -> list[FactionState]:
    factions = []
    for index, faction_id in enumerate(all_faction_ids()):
        total_power = 100.0 + index
        factions.append(
            FactionState(
                id=faction_id,
                military=total_power,
                economy=total_power,
                diplomacy=total_power,
                culture=total_power,
                morale=1.0,
                total_power=total_power,
                status=FactionStatusKind.stable,
                eliminated_at_turn=None,
            )
        )
    return factions


def _relationships() -> list[Relationship]:
    relationships = []
    for from_faction in all_faction_ids():
        for to_faction in all_faction_ids():
            if from_faction == to_faction:
                continue
            relationships.append(
                Relationship(
                    from_faction=from_faction,
                    to_faction=to_faction,
                    value=0.0,
                    status=RelationshipStatus.neutral,
                    treaties=[],
                    last_changed_turn=3,
                )
            )
    return relationships


def _event(
    *,
    event_id: str,
    epoch: int,
    turn: int,
    priority: EventPriority = EventPriority.P1,
    kind: EventKind = EventKind.narration,
    actor_faction: FactionId | None = None,
    target_faction: FactionId | None = None,
) -> GameEvent:
    return GameEvent(
        id=event_id,
        room_id="room-1",
        epoch=epoch,
        turn=turn,
        phase=GamePhase.resolve,
        created_at_ms=100_000 + epoch * 1_000 + turn,
        priority=priority,
        kind=kind,
        actor_faction=actor_faction,
        target_faction=target_faction,
        payload={"event_id": event_id, "target": target_faction.value if target_faction else None},
        narration=f"{event_id} narration for {target_faction or actor_faction or 'table'}",
        visibility=_visibility(),
    )


def _message(
    *,
    message_id: str,
    epoch: int,
    turn: int,
    scope: VisibilityScope,
) -> MessageRecord:
    target = [FactionId.starlight] if scope != VisibilityScope.public else []
    return MessageRecord(
        id=message_id,
        room_id="room-1",
        epoch=epoch,
        turn=turn,
        phase=GamePhase.action,
        from_faction=FactionId.ironCrown,
        to_factions=target,
        visibility=_visibility(scope, [FactionId.ironCrown, *target] if target else []),
        content=f"message {message_id}",
        created_at_ms=200_000 + epoch * 1_000 + turn,
    )


def _speech_action(action_id: str, epoch: int, turn: int, content: str) -> SpeechAction:
    return SpeechAction(
        id=action_id,
        room_id="room-1",
        epoch=epoch,
        turn=turn,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=300_000 + epoch * 1_000 + turn,
        visibility=_visibility(),
        mode="speech",
        content=content,
        targets=[FactionId.starlight],
    )


def _treaty_action() -> TreatyAction:
    return TreatyAction(
        id="treaty-1",
        room_id="room-1",
        epoch=1,
        turn=1,
        phase=GamePhase.action,
        actor_player_id="player-1",
        actor_faction=FactionId.ironCrown,
        created_at_ms=301_001,
        visibility=_visibility(
            VisibilityScope.faction_set,
            [FactionId.ironCrown, FactionId.starlight],
        ),
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight],
        proposal_text="Open trade lanes now and promise protection later.",
    )


def _settlement(epoch: int, turn: int) -> SettlementResult:
    return SettlementResult(
        room_id="room-1",
        epoch=epoch,
        turn=turn,
        generated_at_ms=400_000 + epoch * 1_000 + turn,
        relationship_deltas=[],
        treaty_decisions=[],
        faction_stat_changes=[
            FactionStatChange(
                faction_id=faction_id,
                military_delta=1.0,
                economy_delta=0.0,
                diplomacy_delta=0.0,
                culture_delta=0.0,
                morale_delta=0.0,
                resulting_total_power=100.0 + index + epoch + turn,
            )
            for index, faction_id in enumerate(all_faction_ids())
        ],
        narration_events=[
            _event(
                event_id=f"settlement-narration-{epoch}-{turn}",
                epoch=epoch,
                turn=turn,
                kind=EventKind.narration,
                actor_faction=FactionId.starlight,
            )
        ],
        ai_speeches=[],
    )


async def _seed_finished_room(repos: Repositories) -> None:
    room = _room()
    await repos.rooms.create(room)
    await repos.players.upsert(_player())
    await repos.state.save_factions(room.id, _factions())
    await repos.state.save_relationships(room.id, _relationships())
    await repos.state.save_current_turn(room.id, room.current)

    events = [
        _event(event_id="event-3-3", epoch=3, turn=3),
        _event(
            event_id="betrayal-2-3",
            epoch=2,
            turn=3,
            priority=EventPriority.P0,
            kind=EventKind.betrayal,
            actor_faction=FactionId.ironCrown,
            target_faction=FactionId.starlight,
        ),
        _event(
            event_id="intel-2-2",
            epoch=2,
            turn=2,
            kind=EventKind.intel,
            actor_faction=FactionId.darkTide,
            target_faction=FactionId.starlight,
        ),
    ]
    for epoch in range(1, 4):
        for turn in range(1, 4):
            events.append(
                _event(
                    event_id=f"event-{epoch}-{turn}",
                    epoch=epoch,
                    turn=turn,
                    priority=EventPriority.P0 if (epoch, turn) == (1, 2) else EventPriority.P1,
                )
            )
    for event in events:
        await repos.events.append(event)

    await repos.messages.append_message(
        _message(
            message_id="private-1",
            epoch=1,
            turn=1,
            scope=VisibilityScope.faction_pair,
        )
    )
    await repos.messages.append_message(
        _message(
            message_id="private-2",
            epoch=2,
            turn=2,
            scope=VisibilityScope.faction_pair,
        )
    )
    await repos.messages.append_message(
        _message(message_id="public-1", epoch=3, turn=3, scope=VisibilityScope.public)
    )

    for index in range(7):
        await repos.actions.append(
            _speech_action(
                f"speech-{index}",
                epoch=(index % 3) + 1,
                turn=(index % 3) + 1,
                content="Iron Crown says " + ("very " * index) + "long terms are acceptable.",
            )
        )
    await repos.actions.append(_treaty_action())

    for epoch in range(1, 4):
        for turn in range(1, 4):
            settlement = _settlement(epoch, turn)
            if (epoch, turn) == (1, 1):
                settlement.treaty_decisions.append(
                    TreatyDecision(
                        treaty_id="treaty-1",
                        accepted=True,
                        reason="Useful enough for now.",
                    )
                )
            await repos.settlements.save(settlement)


@pytest.mark.asyncio
async def test_build_replay_returns_complete_dto(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_finished_room(repos)
    service = ReplayService(repos, clock)

    replay = await service.build_replay("room-1")

    assert isinstance(replay, ReplayDTO)
    assert replay.room_id == "room-1"
    assert replay.mode == "solo_1v7"
    assert replay.total_epochs == 3
    assert replay.total_turns == 9
    assert replay.public_events
    assert replay.private_messages
    assert replay.ai_internal_thoughts
    assert replay.faction_curves
    assert replay.relationship_snapshots
    assert replay.key_moments
    assert replay.famous_quotes
    assert replay.betrayal_events
    assert replay.deception_stats
    assert len(replay.final_factions) == len(all_faction_ids())
    assert replay.winner is not None
    assert replay.final_narration


@pytest.mark.asyncio
async def test_replay_timeline_private_messages_and_collections(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_finished_room(repos)
    replay = await ReplayService(repos, clock).build_replay("room-1")

    timeline_keys = [(entry.epoch, entry.turn) for entry in replay.timeline]
    assert timeline_keys == sorted(timeline_keys)
    assert [message["id"] for message in replay.private_messages] == ["private-1", "private-2"]
    assert {message["visibility"]["scope"] for message in replay.private_messages} == {
        "faction_pair"
    }

    assert all(len(curve["points"]) == replay.total_turns for curve in replay.faction_curves)
    assert len(replay.relationship_snapshots) == 3
    assert {snapshot["epoch"] for snapshot in replay.relationship_snapshots} == {1, 2, 3}
    assert all(moment["priority"] == "P0" for moment in replay.key_moments)
    assert len(replay.famous_quotes) <= 5
    assert {item["faction_id"] for item in replay.deception_stats} == {
        faction_id.value for faction_id in all_faction_ids()
    }


@pytest.mark.asyncio
async def test_replay_is_deterministic_except_generated_at_and_saved(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    await _seed_finished_room(repos)
    service = ReplayService(repos, clock)

    first = await service.build_replay("room-1")
    clock.set_ms(900_100)
    second = await service.build_replay("room-1")

    assert first.model_dump(mode="json", exclude={"generated_at_ms"}) == second.model_dump(
        mode="json",
        exclude={"generated_at_ms"},
    )

    stored = await repos.replays.get_replay("room-1")
    assert stored == second.model_dump(mode="json")


@pytest.mark.asyncio
async def test_build_replay_requires_finished_room(
    repos: Repositories,
    clock: FrozenClock,
) -> None:
    room = _room(status=RoomStatus.running)
    await repos.rooms.create(room)

    with pytest.raises(InvalidPhaseError):
        await ReplayService(repos, clock).build_replay(room.id)
