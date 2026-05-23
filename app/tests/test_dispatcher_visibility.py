from __future__ import annotations

import json

import pytest

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.domain.enums import FactionId, PlayerKind, VisibilityScope
from app.domain.models import Player
from app.repositories.factory import make_repositories
from app.services.settlement_service import SettlementOutboundBundle


class FakeSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


def _player(player_id: str, faction_id: FactionId) -> Player:
    return Player(
        id=player_id,
        room_id="room-1",
        display_name=player_id,
        kind=PlayerKind.human,
        faction_id=faction_id,
        connected=True,
        joined_at_ms=1000,
        ready=True,
    )


def _envelope(scope: VisibilityScope, *, payload: dict[str, object]) -> dict[str, object]:
    return {
        "v": 1,
        "id": f"msg-{scope}",
        "t": "action.private",
        "ts": 1,
        "seq": 1,
        "p": {
            "room_id": "room-1",
            "event": {
                "id": f"event-{scope}",
                "visibility": {"scope": scope.value, "faction_ids": payload.get("factions", [])},
                "payload": payload,
            },
        },
    }


async def _seed_dispatcher():
    repos = make_repositories("memory")
    manager = ConnectionManager()
    sockets = {f"p{index}": FakeSocket() for index in range(1, 5)}
    factions = [
        FactionId.ironCrown,
        FactionId.starlight,
        FactionId.emerald,
        FactionId.ashen,
    ]
    for index, faction_id in enumerate(factions, start=1):
        player_id = f"p{index}"
        await repos.players.upsert(_player(player_id, faction_id))
        await manager.register(player_id, sockets[player_id])
        await manager.attach_to_room(player_id, "room-1")
    return OutboundDispatcher(manager, repos), sockets


def _received_player_ids(sockets: dict[str, FakeSocket]) -> list[str]:
    return sorted(player_id for player_id, socket in sockets.items() if socket.sent_texts)


@pytest.mark.asyncio
async def test_public_visibility_reaches_all_room_subscribers() -> None:
    dispatcher, sockets = await _seed_dispatcher()

    await dispatcher.dispatch_to_room(
        "room-1",
        _envelope(VisibilityScope.public, payload={}),
    )

    assert _received_player_ids(sockets) == ["p1", "p2", "p3", "p4"]


@pytest.mark.asyncio
async def test_faction_pair_visibility_reaches_only_pair_members() -> None:
    dispatcher, sockets = await _seed_dispatcher()

    await dispatcher.dispatch_to_room(
        "room-1",
        _envelope(
            VisibilityScope.faction_pair,
            payload={"pair": [FactionId.ironCrown, FactionId.starlight]},
        ),
    )

    assert _received_player_ids(sockets) == ["p1", "p2"]
    assert json.loads(sockets["p1"].sent_texts[0])["p"]["event"]["payload"]["pair"] == [
        "ironCrown",
        "starlight",
    ]


@pytest.mark.asyncio
async def test_faction_set_visibility_reaches_only_set_members() -> None:
    dispatcher, sockets = await _seed_dispatcher()

    await dispatcher.dispatch_to_room(
        "room-1",
        _envelope(
            VisibilityScope.faction_set,
            payload={"set": [FactionId.ironCrown, FactionId.emerald]},
        ),
    )

    assert _received_player_ids(sockets) == ["p1", "p3"]


@pytest.mark.asyncio
async def test_self_visibility_reaches_only_actor_player() -> None:
    dispatcher, sockets = await _seed_dispatcher()

    await dispatcher.dispatch_to_room(
        "room-1",
        _envelope(
            VisibilityScope.self,
            payload={"actor_player_id": "p2", "set": [FactionId.ironCrown]},
        ),
    )

    assert _received_player_ids(sockets) == ["p2"]


@pytest.mark.asyncio
async def test_resolve_bundle_emits_world_lighting_before_ai_speak() -> None:
    dispatcher, sockets = await _seed_dispatcher()
    bundle = SettlementOutboundBundle(
        room_id="room-1",
        epoch=1,
        turn=2,
        generated_at_ms=1000,
        seq_base=20,
        resolve_events=[
            {
                "id": "resolve-1",
                "visibility": {"scope": "public", "faction_ids": []},
                "narration": "resolve event",
            }
        ],
        resolve_map_diff={"changes": [], "border_updates": []},
        resolve_stats_diff={"faction_stats": [], "relationship_changes": []},
        ai_speech_events=[
            {
                "id": "ai-1",
                "visibility": {"scope": "public", "faction_ids": []},
                "narration": "ai speech",
            }
        ],
        resolve_world_lighting={
            "room_id": "room-1",
            "epoch": 1,
            "turn": 2,
            "sun_lat": 18.0,
            "sun_lng": -75.0,
            "day_color": "#d8c58a",
            "night_color": "#0b1b2e",
            "phase_label": "spring",
        },
    )

    await dispatcher.dispatch_resolve_bundle("room-1", bundle)

    sent_types = [json.loads(text)["t"] for text in sockets["p1"].sent_texts]
    assert sent_types == [
        "resolve.events",
        "resolve.map_diff",
        "resolve.stats_diff",
        "resolve.world_lighting",
        "ai.speak",
    ]
    assert json.loads(sockets["p1"].sent_texts[3])["seq"] == 23
