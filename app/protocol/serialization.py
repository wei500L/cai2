from __future__ import annotations

from pydantic import BaseModel

from app.protocol.envelope import Envelope


def serialize_json(envelope: Envelope[BaseModel]) -> bytes:
    return envelope.model_dump_json().encode()


def deserialize_json(raw: bytes, payload_model: type[BaseModel]) -> Envelope[BaseModel]:
    envelope_type = Envelope[payload_model]  # type: ignore[valid-type]
    return envelope_type.model_validate_json(raw)


def serialize_msgpack(envelope: Envelope[BaseModel]) -> bytes:
    raise NotImplementedError("msgpack adapter pending")


def deserialize_msgpack(raw: bytes, payload_model: type[BaseModel]) -> Envelope[BaseModel]:
    raise NotImplementedError("msgpack adapter pending")
