from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.rest.deps import get_clock, get_repositories
from app.core.clock import FrozenClock
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


def test_get_room_factions_meta_returns_default_meta(rest_client: TestClient) -> None:
    room_id, _host_id = _start_solo_room(rest_client)

    response = rest_client.get(f"/debug/v1/rooms/{room_id}/factions_meta")

    assert response.status_code == 200
    factions = response.json()
    assert len(factions) == 8
    assert factions[0]["id"] == "ironCrown"
    assert factions[0]["primary_color"] == "#8B1A1A"
    assert factions[0]["capital_hex_id"]
    assert factions[-1]["id"] == "darkTide"
    assert factions[-1]["primary_color"] == "#6B5A1A"
    assert "secret" not in factions[0]
    assert "hash" not in factions[0]


def test_get_room_factions_meta_unknown_room_returns_404(rest_client: TestClient) -> None:
    response = rest_client.get("/debug/v1/rooms/missing/factions_meta")

    assert response.status_code == 404


def _start_solo_room(client: TestClient) -> tuple[str, str]:
    created = client.post(
        "/debug/v1/rooms",
        json={"mode": "solo_1v7", "host_display_name": "host", "seed": 42},
    )
    assert created.status_code == 200
    room_id = created.json()["room"]["id"]
    host_id = created.json()["host"]["id"]
    selected = client.post(
        f"/debug/v1/rooms/{room_id}/select-faction",
        json={"player_id": host_id, "faction_id": "ironCrown"},
    )
    assert selected.status_code == 200
    ready = client.post(
        f"/debug/v1/rooms/{room_id}/ready",
        json={"player_id": host_id, "ready": True},
    )
    assert ready.status_code == 200
    started = client.post(
        f"/debug/v1/rooms/{room_id}/start",
        json={"player_id": host_id},
    )
    assert started.status_code == 200
    return room_id, host_id
