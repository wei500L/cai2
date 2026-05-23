import { useUIStore } from '@/store/uiStore'

type PerfMonitor = {
  stop: () => void
}

export function startPerfMonitor(): PerfMonitor {
  let frameId = 0
  let lastTime = performance.now()
  let lastQualityDowngradeAt = 0
  let lowFrames = 0
  let criticalFrames = 0
  const criticalFrameThreshold = 90
  const qualityDowngradeCooldownMs = 10_000

  const tick = (time: number) => {
    const delta = Math.max(1, time - lastTime)
    const fps = 1000 / delta
    const ui = useUIStore.getState()

    ui.setPerfStats({ fps })

    if (fps < 45) {
      lowFrames += 1
    } else {
      lowFrames = 0
    }

    if (fps < 30) {
      criticalFrames += 1
    } else if (fps > 38) {
      criticalFrames = 0
    }

    if (lowFrames >= 3) {
      ui.degradeParticleDensity()
      lowFrames = 0
    }

    if (
      criticalFrames >= criticalFrameThreshold &&
      time - lastQualityDowngradeAt >= qualityDowngradeCooldownMs
    ) {
      const nextQuality =
        ui.mapQuality === 'high' ? 'mid' : ui.mapQuality === 'mid' ? 'low' : ui.mapQuality
      if (nextQuality !== ui.mapQuality) {
        ui.setMapQuality(nextQuality)
        lastQualityDowngradeAt = time
      }
      ui.setEffectsDegraded(true)
      criticalFrames = 0
    } else if (fps > 45 && ui.effectsDegraded) {
      ui.setEffectsDegraded(false)
    }

    lastTime = time
    frameId = window.requestAnimationFrame(tick)
  }

  frameId = window.requestAnimationFrame(tick)

  return {
    stop: () => window.cancelAnimationFrame(frameId),
  }
}
