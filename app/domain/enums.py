from enum import StrEnum


class FactionId(StrEnum):
    ironCrown = "ironCrown"
    starlight = "starlight"
    emerald = "emerald"
    ashen = "ashen"
    voidChurch = "voidChurch"
    aurora = "aurora"
    magma = "magma"
    darkTide = "darkTide"


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
    wary = "wary"
    neutral = "neutral"
    friendly = "friendly"
    allied = "allied"


class TreatyKind(StrEnum):
    non_aggression = "non_aggression"
    trade = "trade"
    alliance = "alliance"
    ceasefire = "ceasefire"


class EventPriority(StrEnum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"


class EventKind(StrEnum):
    speech = "speech"
    private = "private"
    declare_war = "declare_war"
    alliance = "alliance"
    trade = "trade"
    betrayal = "betrayal"
    battle = "battle"
    economy = "economy"
    intel = "intel"
    phase_change = "phase_change"
    ai_thinking = "ai_thinking"
    ai_reaction = "ai_reaction"
    narration = "narration"


class VisibilityScope(StrEnum):
    public = "public"
    faction_pair = "faction_pair"
    faction_set = "faction_set"
    self = "self"


class TerrainKind(StrEnum):
    mountain = "mountain"
    plains = "plains"
    river = "river"
    fortress = "fortress"
    desert = "desert"


class FactionStatusKind(StrEnum):
    thriving = "thriving"
    stable = "stable"
    declining = "declining"
    critical = "critical"
    eliminated = "eliminated"


class PlayerKind(StrEnum):
    human = "human"
    ai = "ai"


class RoomStatus(StrEnum):
    lobby = "lobby"
    starting = "starting"
    running = "running"
    finished = "finished"
    aborted = "aborted"
