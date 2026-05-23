import type { ArbitratePhase, GamePhase } from '@/types'

export const MAX_EPOCHS = 8
export const TURNS_PER_EPOCH = 3

export const PHASE_DURATIONS_MS: Record<GamePhase, number> = {
  observe: 15_000,
  action: 90_000,
  resolve: 30_000,
  arbitrate: 50_000,
}

export const ARBITRATE_PHASE_DURATIONS_MS: Record<ArbitratePhase, number> = {
  battle: 20_000,
  epic: 60_000,
  summary: 15_000,
}

export function getPhaseDurationMs(phase: GamePhase, arbitratePhase?: ArbitratePhase) {
  if (phase === 'arbitrate' && arbitratePhase) {
    return ARBITRATE_PHASE_DURATIONS_MS[arbitratePhase]
  }

  return PHASE_DURATIONS_MS[phase]
}
