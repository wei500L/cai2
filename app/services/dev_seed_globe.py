from __future__ import annotations

import json
from dataclasses import dataclass
from time import perf_counter
from typing import Any
from uuid import uuid4

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import Clock
from app.domain.enums import EventKind, EventPriority, FactionId, GamePhase, VisibilityScope
from app.domain.models import BattleEvent, EpochTurn, GameEvent, MessageVisibility
from app.domain.world_lighting import WorldLightingPolicy
from app.game.explosion_resolver import resolve_explosion
from app.llm.client import LLMRequest
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.repositories.factory import Repositories
from app.services.arc_builder import build_arcs_from_events
from app.services.room_service import RoomService
from app.services.scorched_service import ScorchedService

DEFAULT_GLOBE_SEED = 424242
DEFAULT_TURNS = 5
AI_SPEECHES_PER_TURN = 6

_HUMAN_FACTIONS = [
    FactionId.ironCrown,
    FactionId.starlight,
    FactionId.emerald,
    FactionId.ashen,
]
_CAPTURED_TYPES = {
    "room.world_geometry",
    "turn.begin",
    "action.broadcast",
    "resolve.events",
    "resolve.diplomatic_arcs",
    "resolve.event.explosion",
    "resolve.scorched_diff",
    "resolve.world_lighting",
    "ai.thinking",
    "ai.speak",
    "turn.end",
}


@dataclass(slots=True)
class DevSeedGlobeResult:
    room_id: str
    human_players: list[dict[str, Any]]
    ai_factions: list[str]
    turns: int
    duration_ms: int
    emit_sequence: list[str]
    emit_sequence_excerpt: list[dict[str, Any]]
    deterministic_mock: bool
    sequence_valid: bool

    def model_dump(self) -> dict[str, Any]:
        return {
            "room_id": self.room_id,
            "human_players": self.human_players,
            "ai_factions": self.ai_factions,
            "turns": self.turns,
            "duration_ms": self.duration_ms,
            "emit_sequence": self.emit_sequence,
            "emit_sequence_excerpt": self.emit_sequence_excerpt,
            "deterministic_mock": self.deterministic_mock,
            "sequence_valid": self.sequence_valid,
        }


class _CaptureSocket:
    def __init__(self) -> None:
        self.sent_texts: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent_texts.append(text)


async def run_dev_seed_globe(
    *,
    repos: Repositories,
    clock: Clock,
    dispatcher: OutboundDispatcher,
    connection_manager: ConnectionManager,
    turns: int = DEFAULT_TURNS,
    seed: int = DEFAULT_GLOBE_SEED,
    lighting_dynamic: bool = True,
) -> DevSeedGlobeResult:
    started = perf_counter()
    room_service = RoomService(repos, clock)
    player_prefix = f"seed_globe_{uuid4().hex[:8]}"
    room, host = await room_service.create_room(
        mode="multi_4v4",
        host_display_name="Globe QA 1",
        seed=seed,
        host_player_id=f"{player_prefix}_p1",
    )
    players = [host]
    for index in range(2, 5):
        _room, player = await room_service.join_room(
            room_id=room.id,
            display_name=f"Globe QA {index}",
            player_id=f"{player_prefix}_p{index}",
        )
        players.append(player)

    for player, faction_id in zip(players, _HUMAN_FACTIONS, strict=True):
        await room_service.select_faction(
            room_id=room.id,
            player_id=player.id,
            faction_id=faction_id,
        )
        await room_service.set_ready(room_id=room.id, player_id=player.id, ready=True)

    room = await room_service.start_game(room_id=room.id, requester_player_id=host.id)
    players = list(room.players)
    sockets = {player.id: _CaptureSocket() for player in players}
    for player in players:
        await connection_manager.register(player.id, sockets[player.id])
        await connection_manager.attach_to_room(player.id, room.id)

    await dispatcher.dispatch_room_start(room.id)

    scorched_service = ScorchedService()
    lighting_policy = WorldLightingPolicy()
    for turn in range(1, turns + 1):
        await _set_current_turn(repos, clock, room.id, epoch=1, turn=turn, phase=GamePhase.observe)
        await _emit_turn_begin(dispatcher, repos, clock, room.id, epoch=1, turn=turn)

        await _set_current_turn(repos, clock, room.id, epoch=1, turn=turn, phase=GamePhase.action)
        injected_events = await _build_injected_events(repos, clock, room.id, epoch=1, turn=turn)
        for event in injected_events:
            await repos.events.append(event)
            await dispatcher.emit(
                room.id,
                "action.broadcast",
                {"room_id": room.id, "event": event.model_dump(mode="json")},
                seq=event.seq,
            )

        await _set_current_turn(repos, clock, room.id, epoch=1, turn=turn, phase=GamePhase.resolve)
        await dispatcher.emit(
            room.id,
            "resolve.events",
            {
                "room_id": room.id,
                "epoch": 1,
                "turn": turn,
                "events": [event.model_dump(mode="json") for event in injected_events],
            },
        )

        room = await _room_or_raise(repos, room.id)
        capital_rows = room.world_geometry.capitals if room.world_geometry is not None else []
        capitals = {faction_id: (lat, lng) for faction_id, lat, lng in capital_rows}
        arcs = build_arcs_from_events(injected_events, capitals)
        await dispatcher.emit(
            room.id,
            "resolve.diplomatic_arcs",
            {
                "room_id": room.id,
                "epoch": 1,
                "turn": turn,
                "arcs": [arc.model_dump(mode="json") for arc in arcs],
            },
        )

        explosion_events = [
            event for event in injected_events if isinstance(event, BattleEvent)
        ]
        resolutions = []
        for event in explosion_events:
            llm_client = _explosion_client(event)
            resolutions.append(
                await resolve_explosion(
                    event,
                    room.world_geometry,
                    scorched_service.state,
                    llm_client,
                )
            )
        for resolution in resolutions:
            await dispatcher.emit(
                room.id,
                "resolve.event.explosion",
                resolution.payload.model_dump(mode="json"),
            )

        scorched_diff = scorched_service.advance(turn)
        scorched_diff.extend(scorched_service.apply(resolutions, turn))
        await dispatcher.emit(
            room.id,
            "resolve.scorched_diff",
            {
                "room_id": room.id,
                "epoch": 1,
                "turn": turn,
                "changes": [change.model_dump(mode="json") for change in scorched_diff],
            },
        )

        if lighting_dynamic:
            lighting = lighting_policy.next(turn)
            await dispatcher.emit(
                room.id,
                "resolve.world_lighting",
                {
                    "room_id": room.id,
                    "epoch": 1,
                    "turn": turn,
                    "sun_lat": lighting.sun_lat,
                    "sun_lng": lighting.sun_lng,
                    "day_color": lighting.day_color,
                    "night_color": lighting.night_color,
                    "phase_label": lighting.phase_label,
                },
            )

        for faction_id in room.ai_factions:
            await dispatcher.emit(
                room.id,
                "ai.thinking",
                {"room_id": room.id, "faction_id": faction_id, "progress": 1.0},
            )
        for event in await _mock_ai_speak_events(room.id, 1, turn, room.ai_factions, clock):
            await repos.events.append(event)
            await dispatcher.emit(
                room.id,
                "ai.speak",
                {"room_id": room.id, "event": event.model_dump(mode="json")},
                seq=event.seq,
            )

        await dispatcher.emit(
            room.id,
            "turn.end",
            {
                "room_id": room.id,
                "epoch": 1,
                "turn": turn,
                "next_epoch": 1,
                "next_turn": turn + 1,
                "server_time_ms": clock.now_ms(),
            },
        )

    first_socket = sockets[players[0].id]
    envelopes = [json.loads(text) for text in first_socket.sent_texts]
    captured = [envelope for envelope in envelopes if envelope.get("t") in _CAPTURED_TYPES]
    sequence = [str(envelope["t"]) for envelope in captured]
    duration_ms = int((perf_counter() - started) * 1000)
    return DevSeedGlobeResult(
        room_id=room.id,
        human_players=[
            {
                "player_id": player.id,
                "display_name": player.display_name,
                "faction_id": str(player.faction_id) if player.faction_id is not None else None,
            }
            for player in players
        ],
        ai_factions=[str(faction_id) for faction_id in room.ai_factions],
        turns=turns,
        duration_ms=duration_ms,
        emit_sequence=sequence,
        emit_sequence_excerpt=_excerpt(captured),
        deterministic_mock=True,
        sequence_valid=_validate_sequence(sequence, turns, lighting_dynamic=lighting_dynamic),
    )


async def _set_current_turn(
    repos: Repositories,
    clock: Clock,
    room_id: str,
    *,
    epoch: int,
    turn: int,
    phase: GamePhase,
) -> None:
    current = EpochTurn(
        epoch=epoch,
        turn=turn,
        phase=phase,
        arbitrate_phase=None,
        phase_started_at_ms=clock.now_ms(),
        phase_duration_ms=0,
    )
    room = await _room_or_raise(repos, room_id)
    room.current = current
    await repos.state.save_current_turn(room_id, current)
    await repos.rooms.update(room)


async def _emit_turn_begin(
    dispatcher: OutboundDispatcher,
    repos: Repositories,
    clock: Clock,
    room_id: str,
    *,
    epoch: int,
    turn: int,
) -> None:
    await dispatcher.emit(
        room_id,
        "turn.begin",
        {
            "room_id": room_id,
            "epoch": epoch,
            "turn": turn,
            "phase": GamePhase.observe.value,
            "arbitrate_phase": None,
            "phase_duration_ms": 0,
            "phase_started_at_ms": clock.now_ms(),
            "server_time_ms": clock.now_ms(),
            "visible_snapshot": {
                "faction_count": len(await repos.state.get_factions(room_id)),
                "region_count": len(await repos.state.get_regions(room_id)),
            },
        },
    )


async def _build_injected_events(
    repos: Repositories,
    clock: Clock,
    room_id: str,
    *,
    epoch: int,
    turn: int,
) -> list[GameEvent]:
    conflict_specs = await _conflict_specs(repos, room_id)
    events: list[GameEvent] = []
    for index, spec in enumerate(conflict_specs[:3]):
        is_nuke = index == 0
        events.append(
            BattleEvent(
                id=f"seed-globe:{room_id}:{epoch}:{turn}:explosion:{index}",
                room_id=room_id,
                epoch=epoch,
                turn=turn,
                phase=GamePhase.resolve,
                created_at_ms=clock.now_ms(),
                priority=EventPriority.P0,
                kind=EventKind.nuclear_strike if is_nuke else EventKind.battle,
                actor_faction=spec["attacker"],
                target_faction=spec["defender"],
                payload={
                    "region_id": spec["region_id"],
                    "center_hex_id": spec["hex_id"],
                    "weapon_kind": "nuclear" if is_nuke else "conventional",
                    "seeded": True,
                },
                narration=(
                    f"{spec['attacker']} launches a nuclear strike on {spec['region_id']}"
                    if is_nuke
                    else f"{spec['attacker']} opens conventional battle at {spec['region_id']}"
                ),
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
                attacker=spec["attacker"],
                defender=spec["defender"],
                region_id=spec["region_id"],
                atk_loss=12.0 + index,
                def_loss=18.0 + index,
                territory_captured=False,
                morale_shift=-0.02,
                attacker_remaining_troops=80.0 - index,
                defender_remaining_troops=70.0 - index,
            )
        )

    speakers = [FactionId.ironCrown, FactionId.starlight, FactionId.emerald, FactionId.ashen]
    for index in range(5):
        faction_id = speakers[index % len(speakers)]
        events.append(
            GameEvent(
                id=f"seed-globe:{room_id}:{epoch}:{turn}:speech:{index}",
                room_id=room_id,
                epoch=epoch,
                turn=turn,
                phase=GamePhase.resolve,
                created_at_ms=clock.now_ms(),
                priority=EventPriority.P0,
                kind=EventKind.speech,
                actor_faction=faction_id,
                target_faction=None,
                payload={
                    "content": f"Seed globe P0 speech {turn}.{index}",
                    "targets": [str(target) for target in FactionId if target != faction_id],
                    "seeded": True,
                },
                narration=f"{faction_id} broadcasts seed globe P0 speech {turn}.{index}",
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            )
        )
    return events


async def _conflict_specs(repos: Repositories, room_id: str) -> list[dict[str, Any]]:
    regions = await repos.state.get_regions(room_id)
    by_id = {region.id: region for region in regions}
    specs: list[dict[str, Any]] = []
    for attacker in _HUMAN_FACTIONS:
        for source in regions:
            if source.owner != attacker:
                continue
            for neighbor_id in source.neighbors:
                target = by_id.get(neighbor_id)
                if target is None or target.owner is None or target.owner == attacker:
                    continue
                specs.append(
                    {
                        "attacker": attacker,
                        "defender": target.owner,
                        "region_id": target.id,
                        "hex_id": target.hex_id or target.id,
                    }
                )
                break
            if specs and specs[-1]["attacker"] == attacker:
                break
    if len(specs) >= 3:
        return specs

    fallback = [region for region in regions if region.owner is not None]
    for index, target in enumerate(fallback[: 3 - len(specs)]):
        attacker = _HUMAN_FACTIONS[index % len(_HUMAN_FACTIONS)]
        defender = target.owner if target.owner != attacker else FactionId.darkTide
        specs.append(
            {
                "attacker": attacker,
                "defender": defender,
                "region_id": target.id,
                "hex_id": target.hex_id or target.id,
            }
        )
    return specs


def _explosion_client(event: BattleEvent) -> MockLLMClient:
    if event.kind != EventKind.nuclear_strike:
        return MockLLMClient()

    primary_hex_id = str(event.payload.get("center_hex_id") or event.region_id)
    return MockLLMClient(
        deterministic_output={
            "affected_hex_ids": [primary_hex_id],
            "primary_hex_id": primary_hex_id,
            "scorched_turns": 5,
            "fallout_severity": 0.6,
            "economic_loss_pct": 0.35,
            "narrative_hint": f"deterministic nuke centered on {primary_hex_id}",
        }
    )


async def _mock_ai_speak_events(
    room_id: str,
    epoch: int,
    turn: int,
    ai_factions: list[FactionId],
    clock: Clock,
) -> list[GameEvent]:
    if not ai_factions:
        return []
    output = {
        "relationship_deltas": [],
        "ai_speeches": [
            {
                "faction_id": ai_factions[index % len(ai_factions)],
                "kind": "public",
                "content": f"Mock deterministic AI globe response {turn}.{index}",
                "target_faction": None,
                "internal_thought": f"seed-globe deterministic thought {turn}.{index}",
            }
            for index in range(AI_SPEECHES_PER_TURN)
        ],
        "treaty_decisions": [],
        "military_judgements": [],
        "culture_impacts": [],
        "morale_impacts": [],
        "narrative_events": [],
        "map_change_suggestions": [],
        "stat_change_suggestions": [],
    }
    response = await MockLLMClient(deterministic_output=output).call_settlement_model(
        LLMRequest(
            system="seed-globe",
            user=f"turn={turn}",
            temperature=0.0,
            max_tokens=1024,
            metadata={"room_id": room_id, "epoch": epoch, "turn": turn},
        )
    )
    model_output = ModelOutputParser().parse(response.content)
    events: list[GameEvent] = []
    for index, speech in enumerate(model_output.ai_speeches):
        events.append(
            GameEvent(
                id=f"seed-globe:{room_id}:{epoch}:{turn}:ai-speak:{index}",
                room_id=room_id,
                epoch=epoch,
                turn=turn,
                phase=GamePhase.resolve,
                created_at_ms=clock.now_ms(),
                priority=EventPriority.P1,
                kind=EventKind.speech,
                actor_faction=speech.faction_id,
                target_faction=speech.target_faction,
                payload={
                    "content": speech.content,
                    "source": "mock",
                    "speech_kind": speech.kind,
                },
                narration=speech.content,
                visibility=MessageVisibility(scope=VisibilityScope.public, faction_ids=[]),
            )
        )
    return events


async def _room_or_raise(repos: Repositories, room_id: str):
    room = await repos.rooms.get(room_id)
    if room is None:
        raise RuntimeError(f"seed room {room_id} disappeared")
    return room


def _excerpt(envelopes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    excerpt = []
    for envelope in envelopes[:80]:
        payload = envelope.get("p", {})
        row = {
            "seq": envelope.get("seq"),
            "t": envelope.get("t"),
            "turn": payload.get("turn") if isinstance(payload, dict) else None,
        }
        if envelope.get("t") == "resolve.event.explosion" and isinstance(payload, dict):
            row["kind"] = payload.get("kind")
            row["event_id"] = payload.get("event_id")
        excerpt.append(row)
    return excerpt


def _validate_sequence(sequence: list[str], turns: int, *, lighting_dynamic: bool) -> bool:
    try:
        cursor = sequence.index("room.world_geometry") + 1
    except ValueError:
        return False

    for _turn in range(turns):
        try:
            cursor = _expect(sequence, cursor, "turn.begin")
            while sequence[cursor] == "action.broadcast":
                cursor += 1
            cursor = _expect(sequence, cursor, "resolve.events")
            cursor = _expect(sequence, cursor, "resolve.diplomatic_arcs")
            cursor = _expect_n(sequence, cursor, "resolve.event.explosion", 3)
            cursor = _expect(sequence, cursor, "resolve.scorched_diff")
            if lighting_dynamic:
                cursor = _expect(sequence, cursor, "resolve.world_lighting")
            while sequence[cursor] == "ai.thinking":
                cursor += 1
            while sequence[cursor] == "ai.speak":
                cursor += 1
            cursor = _expect(sequence, cursor, "turn.end")
        except (IndexError, ValueError):
            return False
    return True


def _expect(sequence: list[str], cursor: int, message_type: str) -> int:
    if sequence[cursor] != message_type:
        raise ValueError(message_type)
    return cursor + 1


def _expect_n(sequence: list[str], cursor: int, message_type: str, count: int) -> int:
    for _index in range(count):
        cursor = _expect(sequence, cursor, message_type)
    return cursor
