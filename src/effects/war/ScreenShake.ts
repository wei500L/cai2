type ShakeLevel = 'light' | 'medium' | 'heavy'

const LEVEL_TO_PIXELS: Record<ShakeLevel, number> = {
  light: 2.5,
  medium: 5,
  heavy: 8,
}

const MAX_SHAKE_PX = 8

function resolveAmplitude(intensity: ShakeLevel | number) {
  if (typeof intensity === 'number') {
    return Math.min(MAX_SHAKE_PX, Math.max(0, intensity))
  }

  return LEVEL_TO_PIXELS[intensity]
}

function getRootElement() {
  return document.querySelector<HTMLElement>('[data-screen-shake-root]') ?? document.body
}

export class ScreenShake {
  private static frameId = 0
  private static startedAt = 0
  private static duration = 0
  private static amplitude = 0
  private static root: HTMLElement | null = null
  private static baseTransform = ''

  static trigger(intensity: ShakeLevel | number, duration: number) {
    if (typeof window === 'undefined') {
      return
    }

    const amplitude = resolveAmplitude(intensity)
    ScreenShake.startedAt = performance.now()
    ScreenShake.duration = Math.max(0, duration)
    ScreenShake.amplitude = amplitude
    ScreenShake.root = getRootElement()
    ScreenShake.baseTransform = ScreenShake.root.style.transform || ''

    if (ScreenShake.frameId) {
      window.cancelAnimationFrame(ScreenShake.frameId)
    }

    ScreenShake.frameId = window.requestAnimationFrame(ScreenShake.tick)
  }

  private static tick = (time: number) => {
    const root = ScreenShake.root
    if (!root) {
      ScreenShake.frameId = 0
      return
    }

    const progress = Math.min(1, (time - ScreenShake.startedAt) / ScreenShake.duration)
    const decay = Math.pow(1 - progress, 1.55)
    const envelope = ScreenShake.amplitude * decay

    if (progress >= 1 || envelope <= 0.05) {
      root.style.transform = ScreenShake.baseTransform
      ScreenShake.frameId = 0
      return
    }

    const jitterX = Math.sin(time * 0.071) * envelope + Math.sin(time * 0.177) * envelope * 0.34
    const jitterY = Math.cos(time * 0.083) * envelope + Math.sin(time * 0.131) * envelope * 0.28
    const x = Math.max(-MAX_SHAKE_PX, Math.min(MAX_SHAKE_PX, jitterX))
    const y = Math.max(-MAX_SHAKE_PX, Math.min(MAX_SHAKE_PX, jitterY))

    root.style.transform = `${ScreenShake.baseTransform} translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    ScreenShake.frameId = window.requestAnimationFrame(ScreenShake.tick)
  }
}
