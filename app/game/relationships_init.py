from __future__ import annotations

from random import Random

from app.domain.enums import FactionId, RelationshipStatus
from app.domain.factions import all_faction_ids
from app.domain.models import Relationship

_FORCED_RELATIONSHIPS: dict[frozenset[FactionId], tuple[RelationshipStatus, float]] = {
    frozenset({FactionId.ashen, FactionId.ironCrown}): (RelationshipStatus.hostile, -50.0),
    frozenset({FactionId.starlight, FactionId.aurora}): (RelationshipStatus.friendly, 40.0),
    frozenset({FactionId.emerald, FactionId.darkTide}): (RelationshipStatus.friendly, 25.0),
    frozenset({FactionId.voidChurch, FactionId.ashen}): (RelationshipStatus.wary, -15.0),
}


def build_initial_relationships(rng: Random) -> list[Relationship]:
    relationships: list[Relationship] = []
    faction_ids = list(all_faction_ids())

    for from_index, from_faction in enumerate(faction_ids):
        for to_faction in faction_ids[from_index + 1 :]:
            status, value = _relationship_baseline(from_faction, to_faction, rng)
            relationships.append(_relationship(from_faction, to_faction, status, value))
            relationships.append(_relationship(to_faction, from_faction, status, value))

    return relationships


def relationship_status_for_value(value: float) -> RelationshipStatus:
    if value <= -40.0:
        return RelationshipStatus.hostile
    if value <= -10.0:
        return RelationshipStatus.wary
    if value >= 60.0:
        return RelationshipStatus.allied
    if value >= 20.0:
        return RelationshipStatus.friendly
    return RelationshipStatus.neutral


def _relationship_baseline(
    from_faction: FactionId,
    to_faction: FactionId,
    rng: Random,
) -> tuple[RelationshipStatus, float]:
    forced = _FORCED_RELATIONSHIPS.get(frozenset({from_faction, to_faction}))
    if forced is not None:
        return forced

    return RelationshipStatus.neutral, round(rng.uniform(-5.0, 5.0), 4)


def _relationship(
    from_faction: FactionId,
    to_faction: FactionId,
    status: RelationshipStatus,
    value: float,
) -> Relationship:
    return Relationship(
        from_faction=from_faction,
        to_faction=to_faction,
        value=value,
        status=status,
        treaties=[],
        last_changed_turn=0,
    )
