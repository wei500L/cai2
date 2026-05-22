from __future__ import annotations

import json
from typing import Any


def to_json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def from_json_bytes(data: bytes) -> Any:
    return json.loads(data.decode("utf-8"))


def to_msgpack_bytes(payload: Any) -> bytes:
    raise NotImplementedError("msgpack support is intentionally deferred in the MVP.")


def from_msgpack_bytes(data: bytes) -> Any:
    raise NotImplementedError("msgpack support is intentionally deferred in the MVP.")

