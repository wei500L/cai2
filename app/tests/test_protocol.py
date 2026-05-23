from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from app.core.clock import FrozenClock
from app.domain.enums import ArbitratePhase, FactionId, GamePhase, TerrainKind
from app.protocol import (
    INCOMING_PAYLOAD_TYPES,
    OUTGOING_PAYLOAD_TYPES,
    ActionSpeakPayload,
    DiplomaticArcsEvent,
    DiplomaticArcsPayload,
    Envelope,
    ExplosionEvent,
    ExplosionPayload,
    PhaseChangePayload,
    ProtocolError,
    RegionEntryOut,
    ReplayAIDiaryRevealPayload,
    ResolveMapDiffPayload,
    RippleEvent,
    RipplePayload,
    WorldGeometryCellPayload,
    WorldGeometryEvent,
    WorldGeometryFactionPayload,
    WorldGeometryPayload,
    WorldLightingEvent,
    WorldLightingPayload,
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
    envelope = parse_incoming(_raw_envelope("action.speak", _incoming_payloads()["action.speak"]))

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
        server_time_ms=2_000,
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
            server_time_ms=2_000,
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
        "room.snapshot",
        "room.player_takeover",
        "room.player_resume",
        "room.start",
        "room.world_geometry",
        "room.finished",
        "phase.change",
        "turn.begin",
        "action.broadcast",
        "action.private",
        "action.rejected",
        "resolve.events",
        "resolve.map_diff",
        "resolve.stats_diff",
        "resolve.diplomatic_arcs",
        "resolve.event.explosion",
        "resolve.scorched_diff",
        "resolve.ripple",
        "resolve.world_lighting",
        "ai.thinking",
        "ai.speak",
        "ai.reaction",
        "replay.ai_diary_reveal",
        "reconnect.catchup",
        "reconnect.snapshot",
        "error.message",
    }
    assert all(
        issubclass(payload_type, BaseModel) for payload_type in OUTGOING_PAYLOAD_TYPES.values()
    )


def test_world_lighting_event_round_trip_is_stable() -> None:
    payload = WorldLightingEvent(
        v=1,
        id="msg_light",
        t="resolve.world_lighting",
        ts=321,
        seq=15,
        p=WorldLightingPayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            sun_lat=18.0,
            sun_lng=-75.0,
            day_color="#d8c58a",
            night_color="#0b1b2e",
            phase_label="spring",
        ),
    )

    raw = serialize_json(payload)
    decoded = deserialize_json(raw, WorldLightingEvent)

    assert decoded == payload
    assert serialize_json(decoded) == raw


def test_diplomatic_arcs_event_round_trip_is_stable() -> None:
    payload = DiplomaticArcsEvent(
        v=1,
        id="msg_arc",
        t="resolve.diplomatic_arcs",
        ts=456,
        seq=16,
        p=DiplomaticArcsPayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            arcs=[
                {
                    "id": "arc-1",
                    "kind": "speech",
                    "from_faction": FactionId.ironCrown,
                    "to_faction": FactionId.starlight,
                    "color": ["#8B1A1A", "#33AAFF"],
                    "ttl_ms": 4_000,
                    "created_at_ms": 321,
                    "intensity": 0.7,
                    "stroke": 0.6,
                    "dashed": True,
                    "bidirectional": False,
                    "dash_length": 0.3,
                    "dash_gap": 0.05,
                    "dash_animate_time": 1_500,
                }
            ],
        ),
    )

    raw = serialize_json(payload)
    decoded = deserialize_json(raw, DiplomaticArcsEvent)

    assert decoded == payload
    assert serialize_json(decoded) == raw


def test_ripple_event_round_trip_is_stable() -> None:
    payload = RippleEvent(
        v=1,
        id="msg_ripple",
        t="resolve.ripple",
        ts=457,
        seq=17,
        p=RipplePayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            ripples=[
                {
                    "id": "ripple-1",
                    "kind": "speech",
                    "lat": 12.5,
                    "lng": 34.5,
                    "color": "#33FFFF",
                    "max_radius": 300,
                    "ttl_ms": 4_000,
                    "created_at_ms": 321,
                }
            ],
        ),
    )

    raw = serialize_json(payload)
    decoded = deserialize_json(raw, RippleEvent)

    assert decoded == payload
    assert serialize_json(decoded) == raw


def test_explosion_event_round_trip_is_stable() -> None:
    payload = ExplosionEvent(
        v=1,
        id="msg_explosion",
        t="resolve.event.explosion",
        ts=458,
        seq=18,
        p=ExplosionPayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            event_id="battle-1",
            source_region_id="region-1",
            kind="conventional",
            primary_hex_id="hex-1",
            affected_hex_ids=["hex-1"],
            scorched_turns=2,
            fallout_severity=0.5,
            economic_loss_pct=0.25,
            narrative_hint="battle exploded",
            intensity=0.5,
        ),
    )

    raw = serialize_json(payload)
    decoded = deserialize_json(raw, ExplosionEvent)

    assert decoded == payload
    assert serialize_json(decoded) == raw


def test_replay_ai_diary_reveal_payload_validates_entries() -> None:
    payload = ReplayAIDiaryRevealPayload(
        room_id="room-1",
        faction_id=FactionId.starlight,
        entries=[],
    )

    assert payload.t == "replay.ai_diary_reveal"
    assert payload.room_id == "room-1"


def test_region_entry_out_requires_globe_fields() -> None:
    with pytest.raises(ValidationError):
        RegionEntryOut(
            id="region-1",
            owner=FactionId.ironCrown,
            resource_value=18.0,
            development_level=1.0,
            terrain=TerrainKind.plains,
            center_lat_lng=(12.0, 34.0),
            min_garrison=10,
            supply_lines=2,
        )


def test_region_entry_out_serializes_full_globe_fields_when_present() -> None:
    payload = RegionEntryOut(
        id="region-1",
        owner=FactionId.ironCrown,
        resource_value=18.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(12.0, 34.0),
        lat=12.5,
        lng=34.5,
        hex_id="hex-1",
        min_garrison=10,
        supply_lines=2,
    ).model_dump(mode="json", exclude_none=True)

    assert payload["lat"] == 12.5
    assert payload["lng"] == 34.5
    assert payload["hex_id"] == "hex-1"


def test_optional_protocol_fields_are_accepted() -> None:
    from app.protocol.outgoing import (
        ActionPrivateBroadcastPayload,
        AIReactionPayload,
        AISpeakPayload,
        ReconnectCatchupPayload,
        ReconnectSnapshotPayload,
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

    assert (
        PhaseChangePayload(
            room_id="room-1",
            epoch=1,
            turn=2,
            phase=GamePhase.action,
            arbitrate_phase=None,
            phase_duration_ms=30_000,
            phase_started_at_ms=1_000,
            server_time_ms=2_000,
            is_paused=True,
        ).is_paused
        is True
    )

    assert (
        ReconnectCatchupPayload(
            room_id="room-1",
            from_seq=10,
            to_seq=12,
            server_time_ms=2_000,
            messages=[],
        ).to_seq
        == 12
    )

    assert (
        ReconnectSnapshotPayload(
            room_id="room-1",
            server_time_ms=2_000,
            full_state={"room": {"id": "room-1"}},
            seq=12,
        ).seq
        == 12
    )


def test_world_geometry_event_round_trip_is_stable() -> None:
    payload = WorldGeometryEvent(
        v=1,
        id="msg_geo",
        t="room.world_geometry",
        ts=123,
        seq=9,
        p=WorldGeometryPayload(
            seed=42,
            hex_resolution=4,
            total_cells=642,
            factions=[
                WorldGeometryFactionPayload(
                    id=FactionId.ironCrown,
                    capital_hex_id="H4_00001",
                    capital_lat=12.5,
                    capital_lng=34.5,
                ),
                WorldGeometryFactionPayload(
                    id=FactionId.starlight,
                    capital_hex_id="H4_00002",
                    capital_lat=-12.5,
                    capital_lng=-34.5,
                ),
            ],
            cells=[
                WorldGeometryCellPayload(
                    lat=12.5,
                    lng=34.5,
                    hex_id="H4_00001",
                    faction_id=FactionId.ironCrown,
                    terrain=TerrainKind.plains,
                    elevation=0.42,
                    neighbors=[1, 2, 3],
                )
            ],
        ),
    )

    raw = serialize_json(payload)
    decoded = deserialize_json(raw, WorldGeometryEvent)

    assert decoded == payload
    assert serialize_json(decoded) == raw


def test_region_entry_out_serializes_extended_globe_fields_when_present() -> None:
    payload = RegionEntryOut(
        id="region-1",
        owner=FactionId.starlight,
        resource_value=18.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(12.0, 34.0),
        lat=12.5,
        lng=34.5,
        hex_id="abc123",
        min_garrison=10,
        supply_lines=2,
        neighbors=["region-2"],
        resistance=0.25,
        captured_at_turn=7,
    )

    assert payload.model_dump(mode="json", exclude_none=True) == {
        "id": "region-1",
        "owner": "starlight",
        "resource_value": 18.0,
        "development_level": 1.0,
        "terrain": "plains",
        "center_lat_lng": [12.0, 34.0],
        "lat": 12.5,
        "lng": 34.5,
        "hex_id": "abc123",
        "min_garrison": 10,
        "supply_lines": 2,
        "neighbors": ["region-2"],
        "resistance": 0.25,
        "captured_at_turn": 7,
    }


def test_region_entry_out_rejects_missing_globe_fields() -> None:
    with pytest.raises(ValidationError):
        RegionEntryOut(
            id="region-1",
            owner=None,
            resource_value=18.0,
            development_level=1.0,
            terrain=TerrainKind.plains,
            center_lat_lng=(12.0, 34.0),
            lat=None,
            lng=None,
            hex_id=None,
            min_garrison=10,
            supply_lines=2,
            neighbors=[],
            resistance=0.25,
            captured_at_turn=None,
        )


def test_resolve_map_diff_payload_accepts_region_entry_dump() -> None:
    previous = RegionEntryOut(
        id="region-1",
        owner=FactionId.starlight,
        resource_value=18.0,
        development_level=1.0,
        terrain=TerrainKind.plains,
        center_lat_lng=(12.0, 34.0),
        lat=12.5,
        lng=34.5,
        hex_id="abc123",
        min_garrison=10,
        supply_lines=2,
        neighbors=[],
        resistance=0.25,
        captured_at_turn=None,
    )
    payload = ResolveMapDiffPayload(
        room_id="room-1",
        epoch=1,
        turn=2,
        changes=[
            {
                "region_id": "region-1",
                "prev_owner": "starlight",
                "new_owner": "ironCrown",
                "transition": "conquest",
                "animation_params": {"direction": "south_to_north"},
                "previous": previous.model_dump(mode="json", exclude_none=True),
            }
        ],
        border_updates=[],
    )

    dumped = payload.model_dump(mode="json")
    assert dumped["changes"][0]["previous"]["hex_id"] == "abc123"
    assert dumped["changes"][0]["previous"]["lat"] == 12.5


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
