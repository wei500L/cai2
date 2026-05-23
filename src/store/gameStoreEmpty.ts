import type { GameState } from '@/types'

export function createEmptyState(): GameState {
  return {
    epoch: {
      id: 0,
      turn: 0,
      phase: 'observe',
      phaseStartedAt: 0,
      phaseDurationMs: 0,
    },
    factions: [],
    relationships: [],
    treaties: [],
    regions: [],
    events: [],
    privateMessages: [],
    isPaused: false,
    settings: {
      phase_durations: {},
      turns_per_epoch: 0,
      max_epochs: 0,
    },
    status: 'not_started',
    eventsWindow: [],
    currentEpoch: 0,
    currentPhase: 'observe',
    phaseStartedAt: 0,
    winner: null,
    finalNarration: null,
  }
}
