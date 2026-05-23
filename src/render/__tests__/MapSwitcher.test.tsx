/** @vitest-environment jsdom */

import { useEffect } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DAY_NIGHT_MASK_ALPHA } from '@/render/globe/stylePresets'
import { useMapStore } from '@/store/mapStore'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const lifecycle = vi.hoisted(() => ({
  globeMount: vi.fn(),
  globeUnmount: vi.fn(),
  r3fMount: vi.fn(),
  r3fUnmount: vi.fn(),
  canvasMount: vi.fn(),
  canvasUnmount: vi.fn(),
}))

vi.mock('@/render/MapStageGlobe', () => ({
  MapStageGlobe: function MockGlobeStage() {
    useEffect(() => {
      lifecycle.globeMount()
      return () => lifecycle.globeUnmount()
    }, [])

    return <div data-testid="globe-stage" />
  },
}))

vi.mock('@/render/MapStageR3F', () => ({
  MapStageR3F: function MockR3FStage() {
    useEffect(() => {
      lifecycle.r3fMount()
      return () => lifecycle.r3fUnmount()
    }, [])

    return <div data-testid="r3f-stage" />
  },
}))

vi.mock('@/render/MapStage2D', () => ({
  MapStage2D: function MockCanvasStage() {
    useEffect(() => {
      lifecycle.canvasMount()
      return () => lifecycle.canvasUnmount()
    }, [])

    return <div data-testid="2d-stage" />
  },
}))

import { MapSwitcher } from '../MapSwitcher'

describe('MapSwitcher', () => {
  beforeEach(() => {
    useMapStore.setState({
      renderer: 'globe',
      cameraPreset: 'overview',
      focusRegionId: null,
      cinematicEnabled: true,
      reducedMotion: false,
      explosionQueue: [],
      scorchedRegions: new Map(),
      lighting: {
        bloomStrength: 1.4,
        bloomRadius: 0.6,
        bloomThreshold: 0.85,
        starfieldDensity: 0.7,
        dayNightMaskAlpha: DEFAULT_DAY_NIGHT_MASK_ALPHA,
        noiseEnabled: true,
      },
    })
    lifecycle.globeMount.mockClear()
    lifecycle.globeUnmount.mockClear()
    lifecycle.r3fMount.mockClear()
    lifecycle.r3fUnmount.mockClear()
    lifecycle.canvasMount.mockClear()
    lifecycle.canvasUnmount.mockClear()
  })

  it('mounts only one stage at a time and remounts on renderer changes', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<MapSwitcher />)
    })

    expect(container.querySelector('[data-testid="globe-stage"]')).not.toBeNull()
    expect(lifecycle.globeMount).toHaveBeenCalledTimes(1)

    act(() => {
      useMapStore.getState().setRenderer('2d')
    })

    expect(container.querySelector('[data-testid="globe-stage"]')).toBeNull()
    expect(container.querySelector('[data-testid="2d-stage"]')).not.toBeNull()
    expect(lifecycle.globeUnmount).toHaveBeenCalledTimes(1)
    expect(lifecycle.canvasMount).toHaveBeenCalledTimes(1)

    act(() => {
      useMapStore.getState().setRenderer('r3f')
    })

    expect(container.querySelector('[data-testid="2d-stage"]')).toBeNull()
    expect(container.querySelector('[data-testid="r3f-stage"]')).not.toBeNull()
    expect(lifecycle.canvasUnmount).toHaveBeenCalledTimes(1)
    expect(lifecycle.r3fMount).toHaveBeenCalledTimes(1)

    act(() => {
      useMapStore.getState().setRenderer('globe')
    })

    expect(container.querySelector('[data-testid="r3f-stage"]')).toBeNull()
    expect(container.querySelector('[data-testid="globe-stage"]')).not.toBeNull()
    expect(lifecycle.r3fUnmount).toHaveBeenCalledTimes(1)
    expect(lifecycle.globeMount).toHaveBeenCalledTimes(2)

    act(() => {
      root.unmount()
    })

    expect(lifecycle.globeUnmount).toHaveBeenCalledTimes(2)
    container.remove()
  })
})
