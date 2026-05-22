import type { GlobalParticleDensity } from '@/store/uiStore'

const densityMultipliers: Record<GlobalParticleDensity, number> = {
  low: 0.55,
  mid: 1,
  high: 1.45,
  ultra: 2,
}

export function getParticleDensityMultiplier(density: GlobalParticleDensity) {
  return densityMultipliers[density]
}
