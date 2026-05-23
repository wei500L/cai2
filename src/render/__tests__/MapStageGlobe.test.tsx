/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const sceneApi = {
  add: vi.fn(),
}

const rendererDispose = vi.fn()
const destructor = vi.fn()
const composerDispose = vi.fn()
const composerSetSize = vi.fn()
const composerRender = vi.fn()
const bridgeDispose = vi.fn()
const bridgeRestore = vi.fn()
const starfield = {
  rotation: { y: 0 },
  geometry: { dispose: vi.fn() },
  material: { dispose: vi.fn() },
  removeFromParent: vi.fn(),
}
const globeApi = {
  globeImageUrl: vi.fn().mockReturnThis(),
  backgroundColor: vi.fn().mockReturnThis(),
  showAtmosphere: vi.fn().mockReturnThis(),
  showGraticules: vi.fn().mockReturnThis(),
  pointOfView: vi.fn().mockReturnThis(),
  width: vi.fn().mockReturnThis(),
  height: vi.fn().mockReturnThis(),
  hexPolygonsData: vi.fn().mockReturnThis(),
  hexPolygonGeoJsonGeometry: vi.fn().mockReturnThis(),
  hexPolygonResolution: vi.fn().mockReturnThis(),
  hexPolygonColor: vi.fn().mockReturnThis(),
  hexPolygonAltitude: vi.fn().mockReturnThis(),
  hexPolygonMargin: vi.fn().mockReturnThis(),
  hexPolygonUseDots: vi.fn().mockReturnThis(),
  scene: vi.fn(() => sceneApi),
  camera: vi.fn(() => ({})),
  renderer: vi.fn(() => ({ dispose: rendererDispose })),
  postProcessingComposer: vi.fn(() => ({
    render: composerRender,
    setSize: composerSetSize,
    dispose: composerDispose,
  })),
  _destructor: destructor,
}

const setupBloom = vi.fn(() => ({
  composer: {
    __moonEffects: {
      bloom: { intensity: 1.4, radius: 0.6, luminanceMaterial: { threshold: 0.85 } },
      vignette: {},
      noise: { blendMode: { opacity: { value: 0.06 } } },
      effectPass: {},
    },
    render: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
  },
  dispose: vi.fn(),
}))

vi.mock('globe.gl', () => ({
  default: () => () => globeApi,
}))

vi.mock('@/render/globe/postprocess', () => ({
  setupBloom,
  bindComposerBridge: vi.fn(() => ({
    restore: bridgeRestore,
    dispose: bridgeDispose,
  })),
}))

vi.mock('@/render/globe/starfield', () => ({
  createStarfield: vi.fn(() => starfield),
  disposeStarfield: vi.fn(),
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
      lighting: {
        bloomStrength: 1.4,
        bloomRadius: 0.6,
        bloomThreshold: 0.85,
        starfieldDensity: 0.7,
        dayNightMaskAlpha: 0.6,
        noiseEnabled: true,
      },
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
    expect(globeApi.showGraticules).toHaveBeenCalledWith(false)
    expect(globeApi.pointOfView).toHaveBeenCalledWith({ lat: 0, lng: 0, altitude: 2.5 }, 0)
    expect(sceneApi.add).toHaveBeenCalled()
    expect(setupBloom).toHaveBeenCalled()
    expect(globeApi.postProcessingComposer).toHaveBeenCalled()
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
