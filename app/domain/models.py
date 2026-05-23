from __future__ import annotations

from abc import ABC
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.enums import (
    ArbitratePhase,
    EventKind,
    EventPriority,
    FactionId,
    FactionStatusKind,
    GamePhase,
    PlayerKind,
    RelationshipStatus,
    RoomStatus,
    TerrainKind,
    TreatyKind,
    VisibilityScope,
)


class DomainModel(BaseModel):
    model_config = ConfigDict(strict=True, frozen=False, validate_assignment=True)


class Player(DomainModel):
    id: str
    room_id: str | None = None
    display_name: str
    kind: PlayerKind
    faction_id: FactionId | None = None
    connected: bool
    joined_at_ms: int
    ready: bool = False
    ai_takeover: bool = False
    disconnected_at_ms: int | None = None


class FactionState(DomainModel):
    id: FactionId
    military: float
    economy: float
    diplomacy: float
    culture: float
    morale: float = Field(ge=0.3, le=1.8)
    total_power: float
    status: FactionStatusKind
    eliminated_at_turn: int | None = None


class Relationship(DomainModel):
    from_faction: FactionId
    to_faction: FactionId
    value: float = Field(ge=-100.0, le=100.0)
    status: RelationshipStatus
    treaties: list[TreatyKind] = Field(default_factory=list)
    last_changed_turn: int


class Treaty(DomainModel):
    id: str
    kind: TreatyKind
    parties: list[FactionId] = Field(default_factory=list)
    started_epoch: int
    started_turn: int
    ends_epoch: int | None = None
    ends_turn: int | None = None
    active: bool
    metadata: dict[str, Any] = Field(default_factory=dict)


class MapRegion(DomainModel):
    id: str
    owner: FactionId | None = None
    resource_value: float
    development_level: float = Field(ge=0.0, le=1.5)
    terrain: TerrainKind
    center_lat_lng: tuple[float, float]
    min_garrison: int
    supply_lines: int
    neighbors: list[str] = Field(default_factory=list, max_length=8)
    resistance: float = Field(default=0.0, ge=0.0, le=1.0)
    captured_at_turn: int | None = None


class ResourceState(DomainModel):
    faction_id: FactionId
    gdp: float
    region_income: float
    trade_income: float
    maintenance_cost: float
    war_cost: float
    net_income: float


class EpochTurn(DomainModel):
    epoch: int
    turn: int
    phase: GamePhase
    arbitrate_phase: ArbitratePhase | None = None
    phase_started_at_ms: int
    phase_duration_ms: int


class MessageVisibility(DomainModel):
    scope: VisibilityScope
    faction_ids: list[FactionId] = Field(default_factory=list)


class GameActionBase(DomainModel, ABC):
    id: str
    room_id: str
    epoch: int
    turn: int
    phase: GamePhase
    actor_player_id: str
    actor_faction: FactionId
    created_at_ms: int
    visibility: MessageVisibility


class SpeechAction(GameActionBase):
    mode: Literal["speech"]
    content: str = Field(max_length=400)
    targets: list[FactionId] = Field(default_factory=list)


class PrivateMessageAction(GameActionBase):
    mode: Literal["private"]
    content: str
    target_faction: FactionId


class TreatyAction(GameActionBase):
    mode: Literal["treaty"]
    treaty_kind: TreatyKind
    target_factions: list[FactionId] = Field(min_length=1, max_length=3)
    proposal_text: str


class MilitaryAction(GameActionBase):
    mode: Literal["military"]
    source_region: str
    target_region: str
    movement: Literal["move", "attack", "defend"]
    orders_text: str
    troops: int | None = None


class IntelAction(GameActionBase):
    mode: Literal["intel"]
    target_faction: FactionId
    intel_kind: Literal["spy", "interrogate", "intercept"]
    brief: str


class LockAction(GameActionBase):
    mode: Literal["lock"]


GameAction: TypeAlias = Annotated[
    SpeechAction | PrivateMessageAction | TreatyAction | MilitaryAction | IntelAction | LockAction,
    Field(discriminator="mode"),
]


class GameEvent(DomainModel):
    id: str
    room_id: str
    seq: int | None = None
    epoch: int
    turn: int
    phase: GamePhase
    created_at_ms: int
    priority: EventPriority
    kind: EventKind
    actor_faction: FactionId | None = None
    target_faction: FactionId | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    narration: str
    visibility: MessageVisibility


class DiaryEntry(DomainModel):
    faction_id: FactionId
    epoch: int
    turn: int
    internal_thought: str = Field(max_length=600)
    emotion: str
    triggers: list[str] = Field(default_factory=list)
    created_at_ms: int


class BattleEvent(GameEvent):
    attacker: FactionId
    defender: FactionId
    region_id: str
    atk_loss: float
    def_loss: float
    territory_captured: bool
    morale_shift: float
    attacker_remaining_troops: float = 0.0
    defender_remaining_troops: float = 0.0


class RelationshipDelta(DomainModel):
    from_faction: FactionId
    to_faction: FactionId
    delta: float
    reason: str


class TreatyDecision(DomainModel):
    treaty_id: str
    accepted: bool
    reason: str
    counter_proposal: str | None = None


class RegionChange(DomainModel):
    region_id: str
    prev_owner: FactionId | None = None
    new_owner: FactionId | None = None
    transition: Literal["conquest", "cede", "negotiated", "abandoned"]
    animation_params: dict[str, Any] = Field(default_factory=dict)


class FactionStatChange(DomainModel):
    faction_id: FactionId
    military_delta: float
    economy_delta: float
    diplomacy_delta: float
    culture_delta: float
    morale_delta: float
    resulting_military: float | None = None
    resulting_economy: float | None = None
    resulting_diplomacy: float | None = None
    resulting_culture: float | None = None
    resulting_morale: float | None = None
    resulting_total_power: float | None = None
    crisis: bool = False
    reason: str | None = None


class AISpeechItem(DomainModel):
    faction_id: FactionId
    kind: Literal["public", "private", "reaction", "narration"]
    content: str
    target_faction: FactionId | None = None


class SettlementResult(DomainModel):
    room_id: str
    epoch: int
    turn: int
    generated_at_ms: int
    relationship_deltas: list[RelationshipDelta] = Field(default_factory=list)
    treaty_decisions: list[TreatyDecision] = Field(default_factory=list)
    created_treaties: list[Treaty] = Field(default_factory=list)
    battle_results: list[BattleEvent] = Field(default_factory=list)
    region_changes: list[RegionChange] = Field(default_factory=list)
    faction_stat_changes: list[FactionStatChange] = Field(default_factory=list)
    narration_events: list[GameEvent] = Field(default_factory=list)
    ai_speeches: list[AISpeechItem] = Field(default_factory=list)

    @field_validator(
        "relationship_deltas",
        "treaty_decisions",
        "created_treaties",
        "battle_results",
        "region_changes",
        "faction_stat_changes",
        "narration_events",
        "ai_speeches",
        mode="before",
    )
    @classmethod
    def _none_to_empty_list(cls, value: object) -> object:
        return [] if value is None else value


class GameRoom(DomainModel):
    id: str
    status: RoomStatus
    created_at_ms: int
    mode: Literal["solo_1v7", "multi_4v4"]
    max_players: int
    players: list[Player] = Field(default_factory=list)
    ai_factions: list[FactionId] = Field(default_factory=list)
    current: EpochTurn
    seed: int


class GameState(DomainModel):
    room: GameRoom
    latest_message_id: str | None = None
    latest_action_id: str | None = None


class InitialGameState(DomainModel):
    factions: list[FactionState] = Field(default_factory=list)
    regions: list[MapRegion] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    treaties: list[Treaty] = Field(default_factory=list)
    current_turn: EpochTurn


class RecordedPlayerMessage(DomainModel):
    message_id: str
    room_id: str
    player_id: str
    content: str
    created_at_ms: int
    seq: int


class RecordedPlayerAction(DomainModel):
    action_id: str
    room_id: str
    player_id: str
    action_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at_ms: int
    seq: int
