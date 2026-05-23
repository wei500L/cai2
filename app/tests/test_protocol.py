from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from app.core.clock import FrozenClock
from app.domain.enums import ArbitratePhase, FactionId, GamePhase
from app.protocol import (
    INCOMING_PAYLOAD_TYPES,
    OUTGOING_PAYLOAD_TYPES,
    ActionSpeakPayload,
    Envelope,
    PhaseChangePayload,
    ProtocolError,
    deserialize_json,
    make_envelope,
    parse_incoming,
    serialize_json,
    serialize_msgpack,
)
from app.protocol.errors import UnknownMessageTypeError


def _incoming_payloads() -> dict[str, dict[str, object]]:
    return {
        "conn.auth": {"token": "token-1", "client_version": "0.1.0"},
        "conn.ping": {"client_ts": 100},
        "room.create": {
            "mode": "solo_1v7",
            "display_name": "Alice",
            "seed": 7,
        },
        "room.join": {"room_id": "room-1", "display_name": "Alice"},
        "room.leave": {"room_id": "room-1"},
        "room.select_faction": {
            "room_id": "room-1",
            "faction_id": "ironCrown",
        },
        "room.ready": {"room_id": "room-1", "ready": True},
        "action.speak": {
            "room_id": "room-1",
            "mode": "speech",
            "content": "We propose peace.",
            "targets": ["starlight"],
            "metadata": {"tone": "formal"},
        },
        "action.private": {
            "room_id": "room-1",
            "target_faction": "starlight",
            "content": "Private offer.",
            "metadata": None,
        },
        "action.treaty": {
            "room_id": "room-1",
            "treaty_kind": "trade",
            "target_factions": ["starlight"],
            "proposal_text": "Open markets.",
            "metadata": {"tone": "formal"},
        },
        "action.military": {
            "room_id": "room-1",
            "source_region": "r-1",
            "target_region": "r-2",
            "movement": "attack",
            "orders_text": "Advance.",
            "unit_id": "unit-12",
            "troops": 12,
            "metadata": {"stance": "aggressive"},
        },
        "action.intel": {
            "room_id": "room-1",
            "target_faction": "starlight",
            "intel_kind": "spy",
            "brief": "Watch border movement.",
            "metadata": {"source": "field-agent"},
        },
        "action.lock": {"room_id": "room-1"},
        "reconnect.request": {
            "room_id": "room-1",
            "player_id": "player-1",
            "last_seq": 10,
            "session_token": "session-1",
        },
    }


def _raw_envelope(message_type: str, payload: dict[str, object]) -> dict[str, object]:
    return {"v": 1, "id": "msg_x", "t": message_type, "ts": 1, "seq": 2, "p": payload}


def test_envelope_json_round_trip_is_stable() -> None:
    envelope = Envelope[ActionSpeakPayload](
        id="msg_x",
        t="action.speak",
        ts=1,
        seq=2,
        p=ActionSpeakPayload(
            room_id="room-1",
            mode="speech",
            content="hello",
            targets=[FactionId.starlight],
            metadata={"source": "test"},
        ),
    )

    raw = serialize_json(envelope)
    decoded = deserialize_json(raw, ActionSpeakPayload)

    assert serialize_json(decoded) == raw
    assert decoded == envelope
    assert raw == (
        b'{"v":1,"id":"msg_x","t":"action.speak","ts":1,"seq":2,'
        b'"p":{"room_id":"room-1","mode":"speech","content":"hello",'
        b'"targets":["starlight"],"metadata":{"source":"test"}}}'
    )


def test_parse_incoming_action_speak_routes_to_payload_model() -> None:
    envelope = parse_incoming(
        _raw_envelope("action.speak", _incoming_payloads()["action.speak"])
    )

    assert isinstance(envelope.p, ActionSpeakPayload)
    assert envelope.p.targets == [FactionId.starlight]
    assert envelope.t == "action.speak"


@pytest.mark.parametrize("message_type", sorted(_incoming_payloads()))
def test_parse_incoming_routes_all_declared_inbound_types(message_type: str) -> None:
    envelope = parse_incoming(_raw_envelope(message_type, _incoming_payloads()[message_type]))

    assert isinstance(envelope.p, INCOMING_PAYLOAD_TYPES[message_type])
    assert envelope.t == message_type


def test_parse_incoming_missing_required_field_raises_validation_error() -> None:
    raw = _raw_envelope("action.speak", {"room_id": "room-1", "mode": "speech"})

    with pytest.raises(ValidationError):
        parse_incoming(raw)


def test_parse_incoming_unknown_type_raises_protocol_error() -> None:
    with pytest.raises((KeyError, ProtocolError, UnknownMessageTypeError)):
        parse_incoming(_raw_envelope("unknown.message", {}))


def test_make_envelope_for_phase_change_has_complete_fields() -> None:
    payload = PhaseChangePayload(
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=GamePhase.arbitrate,
        arbitrate_phase=ArbitratePhase.battle,
        phase_duration_ms=30_000,
        phase_started_at_ms=1_000,
    )

    envelope = make_envelope(
        "phase.change",
        payload,
        clock=FrozenClock(2_000),
        seq=99,
        msg_id="msg_phase",
    )

    assert envelope.v == 1
    assert envelope.id == "msg_phase"
    assert envelope.t == "phase.change"
    assert envelope.ts == 2_000
    assert envelope.seq == 99
    assert envelope.p == payload


def test_make_envelope_generates_id_and_seq_when_omitted() -> None:
    envelope = make_envelope(
        "phase.change",
        PhaseChangePayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_duration_ms=30_000,
            phase_started_at_ms=1_000,
        ),
        clock=FrozenClock(2_000),
    )

    assert envelope.id.startswith("msg_")
    assert envelope.seq is not None


def test_outgoing_payload_route_table_covers_expected_types() -> None:
    assert set(OUTGOING_PAYLOAD_TYPES) == {
        "conn.auth.ok",
        "conn.auth.fail",
        "conn.pong",
        "conn.kick",
        "room.created",
        "room.joined",
        "room.player_join",
        "room.player_leave",
        "room.start",
        "phase.change",
        "turn.begin",
        "action.broadcast",
        "action.private",
        "action.rejected",
        "resolve.events",
        "resolve.map_diff",
        "resolve.stats_diff",
        "ai.thinking",
        "ai.speak",
        "ai.reaction",
        "reconnect.catchup",
        "reconnect.snapshot",
        "error.message",
    }
    assert all(
        issubclass(payload_type, BaseModel) for payload_type in OUTGOING_PAYLOAD_TYPES.values()
    )


def test_optional_protocol_fields_are_accepted() -> None:
    from app.protocol.outgoing import (
        ActionPrivateBroadcastPayload,
        AIReactionPayload,
        AISpeakPayload,
        ResolveEventsPayload,
    )

    assert ActionPrivateBroadcastPayload(
        room_id="room-1",
        event={"id": "event-1"},
        private_message={"id": "pm-1"},
    ).private_message == {"id": "pm-1"}

    assert ResolveEventsPayload(
        room_id="room-1",
        epoch=1,
        turn=2,
        events=[],
        private_messages=[{"id": "pm-1"}],
    ).private_messages == [{"id": "pm-1"}]

    assert AISpeakPayload(
        room_id="room-1",
        event={"id": "event-1"},
        private_message={"id": "pm-1"},
    ).private_message == {"id": "pm-1"}

    assert AIReactionPayload(
        room_id="room-1",
        event={"id": "event-1"},
        private_message={"id": "pm-2"},
        faction_id=FactionId.starlight,
        reaction="concerned",
    ).private_message == {"id": "pm-2"}

    assert PhaseChangePayload(
        room_id="room-1",
        epoch=1,
        turn=2,
        phase=GamePhase.action,
        arbitrate_phase=None,
        phase_duration_ms=30_000,
        phase_started_at_ms=1_000,
        is_paused=True,
    ).is_paused is True


def test_protocol_payloads_use_strict_validation() -> None:
    with pytest.raises(ValidationError):
        ActionSpeakPayload(
            room_id="room-1",
            mode="speech",
            content="hello",
            targets=[FactionId.starlight],
            metadata=[],
        )

    with pytest.raises(ValidationError):
        PhaseChangePayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            phase="action",
            arbitrate_phase=None,
            phase_duration_ms=30_000,
            phase_started_at_ms=1_000,
        )


def test_msgpack_serialization_is_stubbed() -> None:
    envelope = Envelope[ActionSpeakPayload](
        id="msg_x",
        t="action.speak",
        ts=1,
        seq=2,
        p=ActionSpeakPayload(
            room_id="room-1",
            mode="speech",
            content="hello",
            targets=[],
            metadata=None,
        ),
    )

    with pytest.raises(NotImplementedError, match="msgpack adapter pending"):
        serialize_msgpack(envelope)
