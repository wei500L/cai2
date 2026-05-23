from __future__ import annotations

from dataclasses import dataclass

from app.domain.enums import FactionId
from app.game.explosion_resolver import ExplosionResolution
from app.protocol.explosion_events import ScorchedChange


@dataclass(slots=True)
class ScorchedEntry:
    since_turn: int
    ttl_turns: int
    severity: float
    fallout: float
    owner_faction_id: str | None = None
    resource_value: float = 0.0
    source_event_id: str | None = None


class ScorchedService:
    def __init__(self) -> None:
        self.state: dict[str, ScorchedEntry] = {}

    def apply(self, resolutions: list[ExplosionResolution], turn: int) -> list[ScorchedChange]:
        changes: list[ScorchedChange] = []
        for resolution in resolutions:
            payload = resolution.payload
            analysis = resolution.analysis
            if payload.scorched_turns <= 0:
                continue
            for hex_id in payload.affected_hex_ids:
                if hex_id in analysis.ocean_hex_ids:
                    continue
                resource_value = analysis.hex_resource_values.get(hex_id, 0.0)
                owner_faction_id = analysis.hex_owner_ids.get(hex_id)
                existing = self.state.get(hex_id)
                if existing is None:
                    entry = ScorchedEntry(
                        since_turn=turn,
                        ttl_turns=payload.scorched_turns,
                        severity=payload.fallout_severity,
                        fallout=payload.fallout_severity,
                        owner_faction_id=(
                            owner_faction_id.value if owner_faction_id is not None else None
                        ),
                        resource_value=resource_value,
                        source_event_id=payload.event_id,
                    )
                    self.state[hex_id] = entry
                    changes.append(
                        self._change(
                            hex_id=hex_id,
                            status="applied",
                            turn=turn,
                            entry=entry,
                        )
                    )
                    continue

                existing.ttl_turns = max(existing.ttl_turns, payload.scorched_turns)
                existing.severity = max(existing.severity, payload.fallout_severity)
                existing.fallout = max(existing.fallout, payload.fallout_severity)
                if owner_faction_id is not None:
                    existing.owner_faction_id = owner_faction_id.value
                existing.resource_value = max(existing.resource_value, resource_value)
                existing.source_event_id = payload.event_id
                changes.append(
                    self._change(
                        hex_id=hex_id,
                        status="updated",
                        turn=turn,
                        entry=existing,
                    )
                )
        return changes

    def advance(self, turn: int) -> list[ScorchedChange]:
        changes: list[ScorchedChange] = []
        for hex_id in list(self.state):
            entry = self.state[hex_id]
            entry.ttl_turns -= 1
            if entry.ttl_turns <= 0:
                changes.append(
                    ScorchedChange(
                        hex_id=hex_id,
                        status="recovered",
                        turn=turn,
                        since_turn=entry.since_turn,
                        ttl_turns=0,
                        severity=entry.severity,
                        fallout=entry.fallout,
                        resource_value=entry.resource_value,
                        owner_faction_id=_owner_faction(entry.owner_faction_id),
                        source_event_id=entry.source_event_id,
                    )
                )
                del self.state[hex_id]
                continue

            changes.append(
                ScorchedChange(
                    hex_id=hex_id,
                    status="advanced",
                    turn=turn,
                    since_turn=entry.since_turn,
                    ttl_turns=entry.ttl_turns,
                    severity=entry.severity,
                    fallout=entry.fallout,
                    resource_value=entry.resource_value,
                    owner_faction_id=_owner_faction(entry.owner_faction_id),
                    source_event_id=entry.source_event_id,
                )
            )
        return changes

    def economic_impact(self, faction_id: str, turn: int) -> float:
        del turn
        active_entries = [
            entry
            for entry in self.state.values()
            if entry.owner_faction_id == faction_id and entry.ttl_turns > 0
        ]
        if not active_entries:
            return 0.0
        total_resource = sum(entry.resource_value for entry in active_entries)
        if total_resource <= 0:
            return 0.0
        weighted_loss = sum(
            entry.resource_value * (0.18 + entry.severity * 0.52 + entry.fallout * 0.30)
            for entry in active_entries
        )
        return round(min(0.85, weighted_loss / total_resource), 4)

    def _change(
        self,
        *,
        hex_id: str,
        status: str,
        turn: int,
        entry: ScorchedEntry,
    ) -> ScorchedChange:
        return ScorchedChange(
            hex_id=hex_id,
            status=status,  # type: ignore[arg-type]
            turn=turn,
            since_turn=entry.since_turn,
            ttl_turns=entry.ttl_turns,
            severity=entry.severity,
            fallout=entry.fallout,
            resource_value=entry.resource_value,
            owner_faction_id=_owner_faction(entry.owner_faction_id),
            source_event_id=entry.source_event_id,
        )


def _owner_faction(value: str | None) -> FactionId | None:
    if value is None:
        return None
    return FactionId(value)
