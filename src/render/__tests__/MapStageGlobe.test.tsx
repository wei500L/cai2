/** @vitest-environment jsdom */

import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'

const rendererDispose = vi.fn()
const destructor = vi.fn()
const globeApi = {
  globeImageUrl: vi.fn().mockReturnThis(),
  backgroundColor: vi.fn().mockReturnThis(),
  showAtmosphere: vi.fn().mockReturnThis(),
  pointOfView: vi.fn().mockReturnThis(),
  width: vi.fn().mockReturnThis(),
  height: vi.fn().mockReturnThis(),
  scene: vi.fn(() => ({})),
  camera: vi.fn(() => ({})),
  renderer: vi.fn(() => ({ dispose: rendererDispose })),
  _destructor: destructor,
}

vi.mock('globe.gl', () => ({
  default: () => () => globeApi,
}))

import { MapStageGlobe } from '../MapStageGlobe'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('MapStageGlobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
    useGameStore.getState().initGame(7)
    useMapStore.setState({
      renderer: 'globe',
      cameraPreset: 'overview',
      focusRegionId: null,
      explosionQueue: [],
      scorchedRegions: new Set(),
    })
  })

  afterEach(() => {
    delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  })

  it('mounts the globe instance and disposes it on unmount', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<MapStageGlobe />)
    })

    expect(globeApi.globeImageUrl).toHaveBeenCalledWith(null)
    expect(globeApi.backgroundColor).toHaveBeenCalledWith('#000')
    expect(globeApi.showAtmosphere).toHaveBeenCalledWith(false)
    expect(globeApi.pointOfView).toHaveBeenCalledWith({ lat: 0, lng: 0, altitude: 2.5 }, 0)
    expect(globeApi.width).toHaveBeenCalled()
    expect(globeApi.height).toHaveBeenCalled()

    act(() => {
      root.unmount()
    })

    expect(destructor).toHaveBeenCalledTimes(1)
    expect(rendererDispose).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
    container.remove()
  })
})

