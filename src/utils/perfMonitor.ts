import { useUIStore } from '@/store/uiStore'

type PerfMonitor = {
  stop: () => void
}

export function startPerfMonitor(): PerfMonitor {
  let frameId = 0
  let lastTime = performance.now()
  let lowFrames = 0
  let criticalFrames = 0

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

    if (criticalFrames >= 3) {
      ui.setEffectsDegraded(true)
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
