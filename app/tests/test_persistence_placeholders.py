from __future__ import annotations

import inspect
import re
from typing import Any

import pytest

from app.repositories.base import (
    ActionLogRepository,
    EventLogRepository,
    GameStateRepository,
    MessageLogRepository,
    PlayerRepository,
    ReplayRepository,
    RoomRepository,
    SettlementRepository,
)
from app.repositories.factory import Repositories, make_repositories
from app.repositories.postgres_placeholder import (
    PostgresActionLogRepository,
    PostgresEventLogRepository,
    PostgresGameStateRepository,
    PostgresMessageLogRepository,
    PostgresPlayerRepository,
    PostgresReplayRepository,
    PostgresRoomRepository,
    PostgresSettlementRepository,
)
from app.repositories.redis_placeholder import RedisPubSub

POSTGRES_PENDING = "postgres adapter pending; see docs/PERSISTENCE_PLAN.md"
REDIS_PENDING = "redis adapter pending; see docs/PERSISTENCE_PLAN.md"


def test_make_repositories_memory_returns_complete_container() -> None:
    repos = make_repositories("memory")

    assert isinstance(repos, Repositories)
    for field_name in Repositories.model_fields:
        assert getattr(repos, field_name) is not None


def test_make_repositories_postgres_raises() -> None:
    with pytest.raises(NotImplementedError, match="postgres backend not wired yet"):
        make_repositories("postgres")


@pytest.mark.parametrize(
    ("protocol", "implementation"),
    [
        (RoomRepository, PostgresRoomRepository),
        (PlayerRepository, PostgresPlayerRepository),
        (GameStateRepository, PostgresGameStateRepository),
        (ActionLogRepository, PostgresActionLogRepository),
        (MessageLogRepository, PostgresMessageLogRepository),
        (EventLogRepository, PostgresEventLogRepository),
        (SettlementRepository, PostgresSettlementRepository),
        (ReplayRepository, PostgresReplayRepository),
    ],
)
def test_postgres_repository_signatures_match_protocols(
    protocol: type[Any],
    implementation: type[Any],
) -> None:
    for method_name, protocol_method in inspect.getmembers(protocol, inspect.isfunction):
        if method_name.startswith("_"):
            continue

        implementation_method = getattr(implementation, method_name)
        assert inspect.signature(implementation_method) == inspect.signature(protocol_method)


def _postgres_method_cases() -> list[tuple[object, str, tuple[Any, ...]]]:
    return [
        (PostgresRoomRepository(), "create", (None,)),
        (PostgresRoomRepository(), "get", ("room-1",)),
        (PostgresRoomRepository(), "update", (None,)),
        (PostgresRoomRepository(), "list_active", ()),
        (PostgresRoomRepository(), "delete", ("room-1",)),
        (PostgresPlayerRepository(), "upsert", (None,)),
        (PostgresPlayerRepository(), "get", ("player-1",)),
        (PostgresPlayerRepository(), "list_by_room", ("room-1",)),
        (PostgresGameStateRepository(), "save_factions", ("room-1", [])),
        (PostgresGameStateRepository(), "get_factions", ("room-1",)),
        (PostgresGameStateRepository(), "save_regions", ("room-1", [])),
        (PostgresGameStateRepository(), "get_regions", ("room-1",)),
        (PostgresGameStateRepository(), "save_relationships", ("room-1", [])),
        (PostgresGameStateRepository(), "get_relationships", ("room-1",)),
        (PostgresGameStateRepository(), "save_treaties", ("room-1", [])),
        (PostgresGameStateRepository(), "get_treaties", ("room-1",)),
        (PostgresGameStateRepository(), "save_current_turn", ("room-1", None)),
        (PostgresGameStateRepository(), "get_current_turn", ("room-1",)),
        (PostgresActionLogRepository(), "append", (None,)),
        (PostgresActionLogRepository(), "list_by_room", ("room-1",)),
        (PostgresActionLogRepository(), "list_by_turn", ("room-1", 1, 1)),
        (PostgresActionLogRepository(), "list_by_player", ("room-1", "player-1")),
        (
            PostgresActionLogRepository(),
            "count_by_player_turn",
            ("room-1", "player-1", 1, 1, "speech"),
        ),
        (PostgresMessageLogRepository(), "append_message", (None,)),
        (PostgresMessageLogRepository(), "list_by_room", ("room-1",)),
        (PostgresMessageLogRepository(), "list_by_turn", ("room-1", 1, 1)),
        (PostgresMessageLogRepository(), "list_private_between", ("room-1", [])),
        (PostgresMessageLogRepository(), "list_public", ("room-1", None, None)),
        (PostgresEventLogRepository(), "next_seq", ("room-1",)),
        (PostgresEventLogRepository(), "append", (None,)),
        (PostgresEventLogRepository(), "list_by_turn", ("room-1", 1, 1)),
        (PostgresEventLogRepository(), "list_visible_to_faction", ("room-1", None)),
        (PostgresEventLogRepository(), "list_all", ("room-1",)),
        (PostgresSettlementRepository(), "save", (None,)),
        (PostgresSettlementRepository(), "get", ("room-1", 1, 1)),
        (PostgresSettlementRepository(), "list_by_room", ("room-1",)),
        (PostgresReplayRepository(), "save_replay", ("room-1", {})),
        (PostgresReplayRepository(), "get_replay", ("room-1",)),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(("repository", "method_name", "args"), _postgres_method_cases())
async def test_postgres_repository_methods_raise_not_implemented(
    repository: object,
    method_name: str,
    args: tuple[Any, ...],
) -> None:
    method = getattr(repository, method_name)

    with pytest.raises(NotImplementedError, match=re.escape(POSTGRES_PENDING)):
        if method_name == "list_visible_to_faction":
            result = method(*args, since_seq=0)
        else:
            result = method(*args)
        if inspect.isawaitable(result):
            await result


@pytest.mark.asyncio
async def test_redis_pubsub_connect_raises_not_implemented() -> None:
    pubsub = RedisPubSub()

    with pytest.raises(NotImplementedError, match=re.escape(REDIS_PENDING)):
        await pubsub.connect()
