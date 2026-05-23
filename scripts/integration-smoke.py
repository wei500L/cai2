#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Any
from uuid import uuid4

try:
    import httpx
except ImportError as exc:
    raise SystemExit("Missing dependency: httpx. Install backend dev dependencies first.") from exc

try:
    import websockets
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: websockets. Install backend dev dependencies first."
    ) from exc


BASE_URL = "http://127.0.0.1:8000"
DEBUG_BASE = f"{BASE_URL}/debug/v1"
WS_URL = "ws://127.0.0.1:8000/ws"
TIMEOUT_SECONDS = 10.0


class SmokeFailure(Exception):
    def __init__(self, step: str, body: Any) -> None:
        self.step = step
        self.body = body
        super().__init__(step)


def fail(step: str, body: Any) -> None:
    raise SmokeFailure(step, body)


def require(step: str, condition: bool, body: Any) -> None:
    if not condition:
        fail(step, body)


def http_json(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    step: str,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    url = path if path.startswith("http") else f"{DEBUG_BASE}{path}"
    try:
        response = client.request(method, url, json=json_body, params=params)
    except httpx.HTTPError as exc:
        fail(step, str(exc))

    if response.status_code < 200 or response.status_code >= 300:
        fail(step, response.text)

    try:
        return response.json()
    except ValueError:
        fail(step, response.text)


def envelope(message_type: str, payload: dict[str, Any], seq: int) -> str:
    return json.dumps(
        {
            "v": 1,
            "id": f"smoke_{uuid4().hex[:12]}",
            "t": message_type,
            "ts": int(time.time() * 1000),
            "seq": seq,
            "p": payload,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


async def run_ws_smoke() -> None:
    step = "websocket.connect"
    try:
        async with websockets.connect(WS_URL, open_timeout=TIMEOUT_SECONDS) as ws:
            step = "websocket.conn.auth"
            await ws.send(
                envelope(
                    "conn.auth",
                    {"token": "debug-smoke-token", "client_version": "integration-smoke"},
                    1,
                )
            )
            auth_raw = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT_SECONDS)
            auth = json.loads(auth_raw)
            require(step, auth.get("t") == "conn.auth.ok", auth)

            step = "websocket.conn.ping"
            await ws.send(envelope("conn.ping", {"client_ts": int(time.time() * 1000)}, 2))
            pong_raw = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT_SECONDS)
            pong = json.loads(pong_raw)
            require(step, pong.get("t") == "conn.pong", pong)
    except SmokeFailure:
        raise
    except Exception as exc:
        fail(step, str(exc))


def run_rest_smoke() -> str:
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        health = http_json(client, "GET", f"{BASE_URL}/healthz", step="healthz")
        require("healthz", health.get("status") == "ok", health)
        llm_provider = str(health.get("llm_provider"))
        require("healthz.llm_provider", llm_provider == "mock", health)

        created = http_json(
            client,
            "POST",
            "/rooms",
            step="rooms.create",
            json_body={"mode": "solo_1v7", "host_display_name": "Smoke Host", "seed": 42},
        )
        room_id = created.get("room", {}).get("id")
        player_id = created.get("host", {}).get("id")
        require("rooms.create", isinstance(room_id, str) and isinstance(player_id, str), created)

        selected = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/select-faction",
            step="rooms.select-faction",
            json_body={"player_id": player_id, "faction_id": "ironCrown"},
        )
        require(
            "rooms.select-faction",
            selected.get("room", {}).get("players", [{}])[0].get("faction_id") == "ironCrown",
            selected,
        )

        readied = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/ready",
            step="rooms.ready",
            json_body={"player_id": player_id, "ready": True},
        )
        require(
            "rooms.ready",
            readied.get("room", {}).get("players", [{}])[0].get("ready"),
            readied,
        )

        started = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/start",
            step="rooms.start",
            json_body={"player_id": player_id},
        )
        require("rooms.start", started.get("room", {}).get("status") == "running", started)

        action_phase = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/phase/advance",
            step="phase.advance.observe-to-action",
        )
        require(
            "phase.advance.observe-to-action",
            action_phase.get("current_turn", {}).get("phase") == "action",
            action_phase,
        )

        speech = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/actions/speak",
            step="actions.speak",
            json_body={
                "player_id": player_id,
                "content": "Iron Crown proposes a public smoke-test trade pact.",
                "targets": ["starlight"],
                "request_id": "smoke-speech",
            },
        )
        require("actions.speak", speech.get("accepted") is True and speech.get("action_id"), speech)

        events = http_json(
            client,
            "GET",
            f"/rooms/{room_id}/events",
            step="events.after-speech",
            params={"since_ms": 0},
        )
        event_kinds = {event.get("kind") for event in events if isinstance(event, dict)}
        require(
            "events.after-speech",
            {"speech", "phase_change"} <= event_kinds,
            events,
        )

        locked = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/actions/lock",
            step="actions.lock",
            json_body={"player_id": player_id, "request_id": "smoke-lock"},
        )
        require("actions.lock", locked.get("accepted") is True, locked)

        resolve_phase = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/phase/advance",
            step="phase.advance.action-to-resolve",
        )
        current_turn = resolve_phase.get("current_turn", {})
        require(
            "phase.advance.action-to-resolve",
            current_turn.get("phase") == "resolve",
            resolve_phase,
        )

        settlement = http_json(
            client,
            "POST",
            f"/rooms/{room_id}/settlement/run",
            step="settlement.run",
            json_body={"epoch": current_turn.get("epoch"), "turn": current_turn.get("turn")},
        )
        require(
            "settlement.run",
            isinstance(settlement.get("resolve_events"), list)
            and isinstance(settlement.get("resolve_map_diff"), dict)
            and isinstance(settlement.get("resolve_stats_diff"), dict),
            settlement,
        )
        require("settlement.run.resolve_events", len(settlement["resolve_events"]) > 0, settlement)

        return llm_provider


def main() -> int:
    try:
        llm_provider = run_rest_smoke()
        asyncio.run(run_ws_smoke())
    except SmokeFailure as exc:
        print(f"INTEGRATION SMOKE FAILED step={exc.step}", file=sys.stderr)
        print(f"body={json.dumps(exc.body, ensure_ascii=False, default=str)}", file=sys.stderr)
        return 1

    print(f"INTEGRATION SMOKE PASSED llm_provider={llm_provider}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
