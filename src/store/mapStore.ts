import { createJSONStorage, persist } from 'zustand/middleware'
import { create } from 'zustand'
import type { CameraPreset, ExplosionEvent, GlobeRenderer } from '@/render/globe/globeTypes'
import { DEFAULT_DAY_NIGHT_MASK_ALPHA, globeQualityPresets } from '@/render/globe/stylePresets'
import type { ScorchedDiffPayload } from '@/protocol/types'

export const MAX_EXPLOSION_QUEUE = 30

export type ScorchedRegionEntry = {
  since_turn: number
  ttl_turns: number
  severity: number
  fallout: number
}

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
  cinematicEnabled: boolean
  reducedMotion: boolean
  explosionQueue: ExplosionEvent[]
  scorchedRegions: Map<string, ScorchedRegionEntry>
  lighting: MapLightingState
  sunLat: number
  sunLng: number
  setRenderer: (renderer: GlobeRenderer) => void
  setCameraPreset: (preset: CameraPreset, options?: { immediate?: boolean }) => void
  focusOnRegion: (regionId: string) => void
  clearFocus: () => void
  setCinematicEnabled: (enabled: boolean) => void
  setReducedMotion: (enabled: boolean) => void
  enqueueExplosion: (event: ExplosionEvent) => void
  consumeExplosion: (id: string) => void
  markScorched: (regionId: string) => void
  clearScorched: (regionId: string) => void
  applyScorchedDiff: (payload: ScorchedDiffPayload | { turn: number; changes: ScorchedDiffPayload['changes'] }) => void
  advanceScorched: (turn: number) => void
  setLighting: (lighting: Partial<MapLightingState>) => void
  setSunPosition: (lat: number, lng: number) => void
}

type MapPersistedState = Pick<MapStoreState, 'renderer' | 'lighting' | 'cinematicEnabled' | 'reducedMotion'>

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

const storage = createJSONStorage<MapPersistedState>(getMapRendererStorage)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeScorchedEntry(
  change: ScorchedDiffPayload['changes'][number],
  currentTurn: number,
  previous?: ScorchedRegionEntry,
): ScorchedRegionEntry | null {
  const hexId = typeof change.hex_id === 'string' ? change.hex_id : ''
  if (!hexId) {
    return null
  }

  const ttlTurns = Math.max(0, Math.round(change.scorched_turns_remaining))
  if (ttlTurns <= 0) {
    return null
  }

  const fallout = clamp(
    typeof change.fallout === 'number' && Number.isFinite(change.fallout)
      ? change.fallout
      : previous?.fallout ?? 0,
    0,
    1,
  )
  const severity =
    typeof change.severity === 'number' && Number.isFinite(change.severity)
      ? clamp(change.severity, 0, 1)
      : clamp(0.35 + fallout * 0.35 + Math.min(0.2, ttlTurns * 0.05), 0, 1)

  return {
    since_turn:
      typeof change.scorched_since_turn === 'number' && Number.isFinite(change.scorched_since_turn)
        ? change.scorched_since_turn
        : previous?.since_turn ?? currentTurn,
    ttl_turns: ttlTurns,
    severity,
    fallout,
  }
}

export const useMapStore = create<MapStoreState>()(
  persist(
    (set) => ({
      renderer: 'globe',
      cameraPreset: 'overview',
      focusRegionId: null,
      cinematicEnabled: true,
      reducedMotion: false,
      explosionQueue: [],
      scorchedRegions: new Map<string, ScorchedRegionEntry>(),
      lighting: {
        bloomStrength: globeQualityPresets.mid.bloomStrength,
        bloomRadius: globeQualityPresets.mid.bloomRadius,
        bloomThreshold: globeQualityPresets.mid.bloomThreshold,
        starfieldDensity: globeQualityPresets.mid.starfieldDensity,
        dayNightMaskAlpha: DEFAULT_DAY_NIGHT_MASK_ALPHA,
        noiseEnabled: true,
      },
      sunLat: 10,
      sunLng: 0,
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
      setCinematicEnabled: (cinematicEnabled) => {
        set({ cinematicEnabled })
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion })
      },
      enqueueExplosion: (event) => {
        set((state) => ({
          explosionQueue: [
            ...state.explosionQueue.filter((item) => item.id !== event.id),
            event,
          ].slice(-MAX_EXPLOSION_QUEUE),
        }))
      },
      consumeExplosion: (id) => {
        set((state) => ({
          explosionQueue: state.explosionQueue.filter((event) => event.id !== id),
        }))
      },
      markScorched: (regionId) => {
        set((state) => {
          const scorchedRegions = new Map(state.scorchedRegions)
          scorchedRegions.set(regionId, {
            since_turn: 1,
            ttl_turns: 1,
            severity: 0.5,
            fallout: 0,
          })
          return { scorchedRegions }
        })
      },
      clearScorched: (regionId) => {
        set((state) => {
          const scorchedRegions = new Map(state.scorchedRegions)
          scorchedRegions.delete(regionId)
          return { scorchedRegions }
        })
      },
      applyScorchedDiff: (payload) => {
        const changes = Array.isArray(payload) ? payload : payload.changes
        const turn = Array.isArray(payload) ? 0 : payload.turn
        if (changes.length === 0) {
          return
        }

        set((state) => {
          const next = new Map(state.scorchedRegions)
          for (const change of changes) {
            const hexId = typeof change.hex_id === 'string' ? change.hex_id : ''
            if (!hexId) {
              continue
            }

            const normalized = normalizeScorchedEntry(change, turn, next.get(hexId))
            if (!normalized) {
              next.delete(hexId)
              continue
            }

            next.set(hexId, normalized)
          }

          return { scorchedRegions: next }
        })
      },
      advanceScorched: (turn) => {
        set((state) => {
          let changed = false
          const next = new Map(state.scorchedRegions)

          for (const [hexId, entry] of next.entries()) {
            if (turn - entry.since_turn < entry.ttl_turns) {
              continue
            }

            next.delete(hexId)
            changed = true
          }

          return changed ? { scorchedRegions: next } : {}
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
      setSunPosition: (lat, lng) => {
        set({ sunLat: lat, sunLng: lng })
      },
    }),
    {
      name: 'mapRenderer',
      storage,
      partialize: (state): MapPersistedState => ({
        renderer: state.renderer,
        lighting: state.lighting,
        cinematicEnabled: state.cinematicEnabled,
        reducedMotion: state.reducedMotion,
      }),
    },
  ),
)
