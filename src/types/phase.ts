import type { FactionId } from '@/types/faction'
import type { FactionState } from '@/types/faction'
import type { GameEvent } from '@/types/event'
import type { MapRegion } from '@/types/map'
import type { PrivateMessage } from '@/types/speech'
import type { Relationship, TreatyState } from '@/types/treaty'

export type GamePhase = 'observe' | 'action' | 'resolve' | 'arbitrate'

export type ArbitratePhase = 'battle' | 'epic' | 'summary'

export type Turn = number

export type Epoch = {
  id: number
  turn: Turn
  phase: GamePhase
  arbitratePhase?: ArbitratePhase
  phaseStartedAt: number
  phaseDurationMs: number
}

export type GameSettings = {
  phase_durations: Partial<Record<GamePhase, number>>
  turns_per_epoch: number
  max_epochs: number
}

export type GameStateStatus = 'not_started' | 'snapshot_applied' | 'in_progress' | 'finished'

export type MockGameWorldState = {
  epoch: Epoch
  factions: FactionState[]
  relationships: Relationship[]
  treaties: TreatyState[]
  regions: MapRegion[]
  events: GameEvent[]
  privateMessages: PrivateMessage[]
  isPaused: boolean
}

export type GameState = MockGameWorldState & {
  settings: GameSettings
  status: GameStateStatus
  eventsWindow: GameEvent[]
  currentEpoch: number
  currentPhase: GamePhase
  phaseStartedAt: number
  winner: FactionId | null
  finalNarration: string | null
}
