import { createJSONStorage, persist } from 'zustand/middleware'
import { create } from 'zustand'
import type { CameraPreset, ExplosionEvent, GlobeRenderer } from '@/render/globe/globeTypes'

export type MapLightingState = {
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  starfieldDensity: number
  dayNightMaskAlpha: number
  noiseEnabled: boolean
}

type MapStoreState = {
  renderer: GlobeRenderer
  cameraPreset: CameraPreset
  focusRegionId: string | null
  explosionQueue: ExplosionEvent[]
  scorchedRegions: Set<string>
  lighting: MapLightingState
  setRenderer: (renderer: GlobeRenderer) => void
  setCameraPreset: (preset: CameraPreset, options?: { immediate?: boolean }) => void
  focusOnRegion: (regionId: string) => void
  clearFocus: () => void
  enqueueExplosion: (event: ExplosionEvent) => void
  consumeExplosion: (id: string) => void
  markScorched: (regionId: string) => void
  clearScorched: (regionId: string) => void
  setLighting: (lighting: Partial<MapLightingState>) => void
}

const memoryStorage = (() => {
  const values = new Map<string, string>()
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value)
    },
    removeItem: (name: string) => {
      values.delete(name)
    },
  }
})()

function getMapRendererStorage() {
  try {
    const candidate = typeof window === 'undefined' ? null : window.localStorage
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function' &&
      typeof candidate.removeItem === 'function'
    ) {
      return candidate
    }
  } catch {
    return memoryStorage
  }

  return memoryStorage
}

const storage = createJSONStorage<MapStoreState>(getMapRendererStorage)

export const useMapStore = create<MapStoreState>()(
  persist(
    (set) => ({
      renderer: 'globe',
      cameraPreset: 'overview',
      focusRegionId: null,
      explosionQueue: [],
      scorchedRegions: new Set<string>(),
      lighting: {
        bloomStrength: 1.4,
        bloomRadius: 0.6,
        bloomThreshold: 0.85,
        starfieldDensity: 0.7,
        dayNightMaskAlpha: 0.6,
        noiseEnabled: true,
      },
      setRenderer: (renderer) => {
        set({ renderer })
      },
      setCameraPreset: (cameraPreset) => {
        set({ cameraPreset })
      },
      focusOnRegion: (focusRegionId) => {
        set({ focusRegionId })
      },
      clearFocus: () => {
        set({ focusRegionId: null })
      },
      enqueueExplosion: (event) => {
        set((state) => ({
          explosionQueue: [...state.explosionQueue.filter((item) => item.id !== event.id), event],
        }))
      },
      consumeExplosion: (id) => {
        set((state) => ({
          explosionQueue: state.explosionQueue.filter((event) => event.id !== id),
        }))
      },
      markScorched: (regionId) => {
        set((state) => {
          const scorchedRegions = new Set(state.scorchedRegions)
          scorchedRegions.add(regionId)
          return { scorchedRegions }
        })
      },
      clearScorched: (regionId) => {
        set((state) => {
          const scorchedRegions = new Set(state.scorchedRegions)
          scorchedRegions.delete(regionId)
          return { scorchedRegions }
        })
      },
      setLighting: (lighting) => {
        set((state) => ({
          lighting: {
            ...state.lighting,
            ...lighting,
          },
        }))
      },
    }),
    {
      name: 'mapRenderer',
      storage,
      partialize: (state) => ({ renderer: state.renderer, lighting: state.lighting }),
    },
  ),
)
