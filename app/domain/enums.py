from enum import StrEnum


class GamePhase(StrEnum):
    observe = "observe"
    action = "action"
    resolve = "resolve"
    arbitrate = "arbitrate"


class ArbitratePhase(StrEnum):
    battle = "battle"
    epic = "epic"
    summary = "summary"


class RelationshipStatus(StrEnum):
    hostile = "hostile"
    neutral = "neutral"
    friendly = "friendly"
    ally = "ally"

