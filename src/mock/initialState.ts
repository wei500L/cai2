import type { GameState } from '@/types'
import { createInitialState as createDevelopmentInitialState, getDevelopmentFactionName } from '@/store/gameStoreSeed'

export function createInitialState(seed = 2_026_052_2): GameState {
  return createDevelopmentInitialState(seed)
}

export function getFactionName(id: Parameters<typeof getDevelopmentFactionName>[0]) {
  return getDevelopmentFactionName(id)
}
