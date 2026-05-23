import { createJSONStorage, persist } from 'zustand/middleware'
import { create } from 'zustand'
import type { CameraPreset, ExplosionEvent, GlobeRenderer } from '@/render/globe/globeTypes'

type MapStoreState = {
  renderer: GlobeRenderer
  cameraPreset: CameraPreset
  focusRegionId: string | null
  explosionQueue: ExplosionEvent[]
  scorchedRegions: Set<string>
  setRenderer: (renderer: GlobeRenderer) => void
  setCameraPreset: (preset: CameraPreset, options?: { immediate?: boolean }) => void
  focusOnRegion: (regionId: string) => void
  clearFocus: () => void
  enqueueExplosion: (event: ExplosionEvent) => void
  consumeExplosion: (id: string) => void
  markScorched: (regionId: string) => void
  clearScorched: (regionId: string) => void
}

const storage =
  typeof window === 'undefined'
    ? createJSONStorage<MapStoreState>(() => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      }))
    : createJSONStorage<MapStoreState>(() => window.localStorage)

export const useMapStore = create<MapStoreState>()(
  persist(
    (set) => ({
      renderer: 'globe',
      cameraPreset: 'overview',
      focusRegionId: null,
      explosionQueue: [],
      scorchedRegions: new Set<string>(),
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
    }),
    {
      name: 'mapRenderer',
      storage,
      partialize: (state) => ({ renderer: state.renderer }),
    },
  ),
)

