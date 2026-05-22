from __future__ import annotations

import json
from typing import Any, Generic, Protocol, TypeVar
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from app.protocol.errors import ProtocolError

PayloadT = TypeVar("PayloadT", bound=BaseModel)


class ClockLike(Protocol):
    def now_ms(self) -> int:
        """Return the current time in milliseconds."""


class Envelope(BaseModel, Generic[PayloadT]):
    model_config = ConfigDict(strict=True, extra="forbid")

    v: int = 1
    id: str
    t: str
    ts: int
    seq: int | None = None
    p: PayloadT


_auto_seq = 0


def _new_message_id() -> str:
    return f"msg_{uuid4().hex[:12]}"


def _next_seq() -> int:
    global _auto_seq
    _auto_seq += 1
    return _auto_seq


def make_envelope(
    t: str,
    payload: PayloadT,
    *,
    clock: ClockLike,
    seq: int | None = None,
    msg_id: str | None = None,
) -> Envelope[PayloadT]:
    return Envelope[type(payload)](  # type: ignore[valid-type]
        v=1,
        id=msg_id or _new_message_id(),
        t=t,
        ts=clock.now_ms(),
        seq=seq if seq is not None else _next_seq(),
        p=payload,
    )


def parse_envelope(raw: dict[str, Any], payload_model: type[PayloadT]) -> Envelope[PayloadT]:
    message_type = raw.get("t")
    expected_type = payload_model.model_fields.get("t")
    if expected_type is not None and message_type != expected_type.default:
        raise ProtocolError(
            f"payload model {payload_model.__name__} does not match message type {message_type!r}"
        )

    data = dict(raw)
    if "p" in data:
        payload_json = json.dumps(data["p"], ensure_ascii=False, separators=(",", ":"))
        data["p"] = payload_model.model_validate_json(payload_json)

    envelope_type = Envelope[payload_model]  # type: ignore[valid-type]
    return envelope_type.model_validate(data)
