import { useEffect, useMemo, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'
import type { ExplosionFxHandle } from '@/render/globe/explosionFx'

const MAX_ACTIVE_EXPLOSIONS = 6

type TickCallback = (dtMs: number) => void

type TickableGlobe = GlobeInstance & {
  onTick?: (callback: TickCallback) => (() => void) | GlobeInstance
  tickFunction?: (callback: TickCallback) => (() => void) | GlobeInstance
}

export class FxLoopController {
  private handles: ExplosionFxHandle[] = []
  private readonly maxHandles: number

  constructor(maxHandles = MAX_ACTIVE_EXPLOSIONS) {
    this.maxHandles = maxHandles
  }

  add(handle: ExplosionFxHandle) {
    while (this.handles.length >= this.maxHandles) {
      this.handles.shift()?.dispose()
    }

    this.handles.push(handle)
  }

  update(dtMs: number) {
    const alive: ExplosionFxHandle[] = []

    for (const handle of this.handles) {
      if (handle.isAlive()) {
        handle.update(dtMs)
      }

      if (handle.isAlive()) {
        alive.push(handle)
      } else {
        handle.dispose()
      }
    }

    this.handles = alive
  }

  disposeAll() {
    for (const handle of this.handles) {
      handle.dispose()
    }

    this.handles = []
  }

  activeCount() {
    return this.handles.length
  }
}

function bindGlobeTick(globe: GlobeInstance, callback: TickCallback) {
  const tickable = globe as TickableGlobe
  const tickHook = tickable.onTick ?? tickable.tickFunction

  if (typeof tickHook !== 'function') {
    return null
  }

  const result = tickHook.call(tickable, callback)
  return typeof result === 'function' ? result : null
}

export function useFxLoop(
  globe: GlobeInstance | null,
  options: {
    onFrame?: TickCallback
  } = {},
) {
  const controller = useMemo(() => new FxLoopController(), [])
  const onFrameRef = useRef(options.onFrame)

  useEffect(() => {
    onFrameRef.current = options.onFrame
  }, [options.onFrame])

  useEffect(() => {
    if (!globe) {
      return undefined
    }

    let lastTime = performance.now()
    const tick = (dtMs: number) => {
      const delta = Math.min(64, Math.max(0, dtMs))
      onFrameRef.current?.(delta)
      controller.update(delta)
    }
    const unbindTick = bindGlobeTick(globe, tick)

    if (unbindTick) {
      return () => {
        unbindTick()
        controller.disposeAll()
      }
    }

    let frameId = 0
    const frame = (now: number) => {
      tick(now - lastTime)
      lastTime = now
      frameId = requestAnimationFrame(frame)
    }

    frameId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(frameId)
      controller.disposeAll()
    }
  }, [controller, globe])

  return controller
}
