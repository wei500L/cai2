from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.rest.deps import get_clock, get_repositories
from app.core.clock import FrozenClock
from app.domain.enums import FactionId
from app.main import app
from app.repositories.factory import make_repositories


@pytest.fixture()
def rest_client() -> Iterator[TestClient]:
    repos = make_repositories("memory")
    clock = FrozenClock(1000)

    app.dependency_overrides[get_repositories] = lambda: repos
    app.dependency_overrides[get_clock] = lambda: clock
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_debug_router_registers_required_routes() -> None:
    routes = {
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/debug/v1")
    }

    assert len(routes) >= 19
    assert "/debug/v1/rooms" in routes
    assert "/debug/v1/rooms/{room_id}/actions/speak" in routes
    assert "/debug/v1/rooms/{room_id}/settlement/run" in routes
    assert "/debug/v1/rooms/{room_id}/replay" in routes
    assert "/debug/v1/runtime/config" in routes


def test_runtime_config(rest_client: TestClient) -> None:
    response = rest_client.get("/debug/v1/runtime/config")

    assert response.status_code == 200
    body = response.json()
    assert body["ws_path"] == "/ws"
    assert body["rest_prefix"] == "/debug/v1"
    assert body["env"] == "dev"
    assert body["llm_provider"] == "mock"
    assert isinstance(body["server_time_ms"], int)


def test_rest_debug_end_to_end_flow(rest_client: TestClient) -> None:
    created = rest_client.post(
        "/debug/v1/rooms",
        json={"mode": "multi_4v4", "host_display_name": "host", "seed": 42},
    )
    assert created.status_code == 200
    created_body = created.json()
    room_id = created_body["room"]["id"]
    host = created_body["host"]
    players = [host]

    for name in ("p2", "p3", "p4"):
        joined = rest_client.post(
            f"/debug/v1/rooms/{room_id}/join",
            json={"display_name": name},
        )
        assert joined.status_code == 200
        body = joined.json()
        assert body["room"]["id"] == room_id
        players.append(body["player"])

    for player, faction_id in zip(players, list(FactionId)[:4], strict=True):
        selected = rest_client.post(
            f"/debug/v1/rooms/{room_id}/select-faction",
            json={"player_id": player["id"], "faction_id": faction_id.value},
        )
        assert selected.status_code == 200
        readied = rest_client.post(
            f"/debug/v1/rooms/{room_id}/ready",
            json={"player_id": player["id"], "ready": True},
        )
        assert readied.status_code == 200

    started = rest_client.post(
        f"/debug/v1/rooms/{room_id}/start",
        json={"player_id": host["id"]},
    )
    assert started.status_code == 200
    assert started.json()["room"]["status"] == "running"

    state = rest_client.get(f"/debug/v1/rooms/{room_id}")
    assert state.status_code == 200
    state_body = state.json()
    assert state_body["room"]["id"] == room_id
    assert state_body["factions"]
    assert state_body["regions"]
    assert state_body["relationships"]
    assert state_body["current_turn"]["phase"] == "observe"

    advanced_to_action = rest_client.post(f"/debug/v1/rooms/{room_id}/phase/advance")
    assert advanced_to_action.status_code == 200
    assert advanced_to_action.json()["current_turn"]["phase"] == "action"

    speech = rest_client.post(
        f"/debug/v1/rooms/{room_id}/actions/speak",
        json={
            "player_id": host["id"],
            "content": "Iron Crown proposes public trade with Starlight.",
            "targets": ["starlight"],
            "request_id": "req-speech",
        },
    )
    assert speech.status_code == 200
    assert speech.json()["accepted"] is True
    assert speech.json()["action_id"]

    locked = rest_client.post(
        f"/debug/v1/rooms/{room_id}/actions/lock",
        json={"player_id": host["id"], "request_id": "req-lock"},
    )
    assert locked.status_code == 200
    assert locked.json()["accepted"] is True

    advanced_to_resolve = rest_client.post(f"/debug/v1/rooms/{room_id}/phase/advance")
    assert advanced_to_resolve.status_code == 200
    current_turn = advanced_to_resolve.json()["current_turn"]
    assert current_turn["phase"] == "resolve"

    settlement = rest_client.post(
        f"/debug/v1/rooms/{room_id}/settlement/run",
        json={"epoch": current_turn["epoch"], "turn": current_turn["turn"]},
    )
    assert settlement.status_code == 200
    settlement_body = settlement.json()
    assert settlement_body["room_id"] == room_id
    assert settlement_body["resolve_events"]

    events = rest_client.get(f"/debug/v1/rooms/{room_id}/events", params={"since_ms": 0})
    assert events.status_code == 200
    assert events.json()

    messages = rest_client.get(
        f"/debug/v1/rooms/{room_id}/messages",
        params={"epoch": current_turn["epoch"], "turn": current_turn["turn"]},
    )
    assert messages.status_code == 200
    assert messages.json()[0]["content"].startswith("Iron Crown")

    _advance_until_finished(rest_client, room_id)

    replay = rest_client.get(f"/debug/v1/rooms/{room_id}/replay")
    assert replay.status_code == 200
    replay_body = replay.json()
    assert replay_body["room_id"] == room_id
    assert replay_body["timeline"]
    assert replay_body["public_events"]
    assert replay_body["famous_quotes"]


def test_speak_outside_action_phase_returns_400(rest_client: TestClient) -> None:
    room_id, host_id = _start_solo_room(rest_client)

    response = rest_client.post(
        f"/debug/v1/rooms/{room_id}/actions/speak",
        json={
            "player_id": host_id,
            "content": "too early",
            "targets": ["starlight"],
        },
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "InvalidPhaseError"


def test_duplicate_select_faction_returns_409(rest_client: TestClient) -> None:
    created = rest_client.post(
        "/debug/v1/rooms",
        json={"mode": "multi_4v4", "host_display_name": "host"},
    )
    room_id = created.json()["room"]["id"]
    host_id = created.json()["host"]["id"]
    joined = rest_client.post(
        f"/debug/v1/rooms/{room_id}/join",
        json={"display_name": "p2"},
    )
    player_id = joined.json()["player"]["id"]

    first = rest_client.post(
        f"/debug/v1/rooms/{room_id}/select-faction",
        json={"player_id": host_id, "faction_id": "ironCrown"},
    )
    assert first.status_code == 200
    duplicate = rest_client.post(
        f"/debug/v1/rooms/{room_id}/select-faction",
        json={"player_id": player_id, "faction_id": "ironCrown"},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "FactionAlreadyTakenError"


def test_replay_endpoint_returns_safe_snapshot_before_finished(rest_client: TestClient) -> None:
    room_id, _host_id = _start_solo_room(rest_client)

    response = rest_client.get(f"/debug/v1/rooms/{room_id}/replay")

    assert response.status_code == 200
    body = response.json()
    assert body["room_id"] == room_id
    assert body["winner"] is None
    assert body["ai_internal_thoughts"] == []
    assert "游戏尚未结束" in body["final_narration"]


def _advance_until_finished(rest_client: TestClient, room_id: str) -> None:
    for _ in range(100):
        state = rest_client.get(f"/debug/v1/rooms/{room_id}")
        assert state.status_code == 200
        if state.json()["room"]["status"] == "finished":
            return

        advanced = rest_client.post(f"/debug/v1/rooms/{room_id}/phase/advance")
        assert advanced.status_code == 200

    pytest.fail("room did not finish within debug phase advance budget")


def test_missing_room_returns_404(rest_client: TestClient) -> None:
    response = rest_client.get("/debug/v1/rooms/missing-room")

    assert response.status_code == 404
    assert response.json()["error_code"] == "RoomNotFoundError"


def _start_solo_room(client: TestClient) -> tuple[str, str]:
    created = client.post(
        "/debug/v1/rooms",
        json={"mode": "solo_1v7", "host_display_name": "host"},
    )
    assert created.status_code == 200
    room_id = created.json()["room"]["id"]
    host_id = created.json()["host"]["id"]

    selected = client.post(
        f"/debug/v1/rooms/{room_id}/select-faction",
        json={"player_id": host_id, "faction_id": "ironCrown"},
    )
    assert selected.status_code == 200
    readied = client.post(
        f"/debug/v1/rooms/{room_id}/ready",
        json={"player_id": host_id, "ready": True},
    )
    assert readied.status_code == 200
    started = client.post(
        f"/debug/v1/rooms/{room_id}/start",
        json={"player_id": host_id},
    )
    assert started.status_code == 200
    return room_id, host_id
