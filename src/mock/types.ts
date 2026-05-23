import type { FactionId } from '@/mock/factions'

export type { FactionId } from '@/mock/factions'

export type GamePhase = 'observe' | 'action' | 'resolve' | 'arbitrate'

export type ArbitratePhase = 'battle' | 'epic' | 'summary'

export type Epoch = {
  id: number
  turn: number
  phase: GamePhase
  arbitratePhase?: ArbitratePhase
  phaseStartedAt: number
  phaseDurationMs: number
}

export type FactionState = {
  id: FactionId
  military: number
  economy: number
  diplomacy: number
  culture: number
  morale: number
  totalPower: number
  status: 'thriving' | 'stable' | 'declining' | 'critical' | 'eliminated'
}

export type RelationshipValue = number

export type RelationshipStatus = 'hostile' | 'wary' | 'neutral' | 'friendly' | 'allied'

export type TreatyKind = 'non_aggression' | 'trade' | 'alliance' | 'ceasefire'

export type Treaty = {
  id: string
  kind: TreatyKind
  parties: FactionId[]
  started_epoch: number
  started_turn: number
  ends_epoch: number | null
  ends_turn: number | null
  active: boolean
  metadata: Record<string, unknown>
}

export type Relationship = {
  from: FactionId
  to: FactionId
  value: RelationshipValue
  status: RelationshipStatus
  treaties: TreatyKind[]
}

export type EventPriority = 'P0' | 'P1' | 'P2'

export type EventKind =
  | 'speech'
  | 'private'
  | 'declare_war'
  | 'alliance'
  | 'trade'
  | 'non_aggression'
  | 'ceasefire'
  | 'betrayal'
  | 'battle'
  | 'economy'
  | 'intel'
  | 'phase_change'
  | 'ai_thinking'
  | 'ai_reaction'
  | 'narration'

export type GameEvent = {
  id: string
  seq?: number
  createdAt: number
  epoch: number
  turn: number
  phase: GamePhase
  priority: EventPriority
  kind: EventKind
  actor?: FactionId
  target?: FactionId
  payload: Record<string, unknown>
  narration: string
}

export type BattleEvent = GameEvent & {
  kind: 'battle'
  actor: FactionId
  target: FactionId
  payload: {
    regionId: string
    attacker: FactionId
    defender: FactionId
    attackerPower: number
    defenderPower: number
    winner: FactionId
    loser: FactionId
    casualties: {
      attacker: number
      defender: number
    }
    atk_loss?: number
    def_loss?: number
    territory_captured?: boolean
    morale_shift?: number | {
      attacker?: number
      defender?: number
    }
    regionOwnerChanged: boolean
    stateApplied?: boolean
  }
}

export type SpeechEvent = GameEvent & {
  kind: 'speech'
  actor: FactionId
  payload: {
    channel: 'public'
    stance: 'conciliatory' | 'threatening' | 'pragmatic' | 'ceremonial'
    text: string
  }
}

export type PrivateMessage = {
  id: string
  createdAt: number
  epoch: number
  turn: number
  phase: GamePhase
  from: FactionId
  to: FactionId
  priority: EventPriority
  subject: string
  body: string
  encrypted: boolean
  payload: Record<string, unknown>
}

export type MapRegion = {
  id: string
  owner: FactionId | null
  resourceValue: number
  developmentLevel: number
  centerLatLng: [number, number]
  terrain: 'mountain' | 'plains' | 'river' | 'fortress' | 'desert'
  minGarrison: number
  supplyLines: number
  neighbors: string[]
}

export type MockGameWorldState = {
  epoch: Epoch
  factions: FactionState[]
  relationships: Relationship[]
  treaties: Treaty[]
  regions: MapRegion[]
  events: GameEvent[]
  privateMessages: PrivateMessage[]
  isPaused: boolean
}
