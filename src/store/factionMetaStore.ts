import { create } from 'zustand'
import { FACTION_IDS, type FactionId, type FactionMeta } from '@/types/faction'
import type { FactionMetaPayload } from '@/protocol/types'

type FactionMetaSource = 'ws' | 'rest' | 'mock' | 'pending'

type FactionMetaState = {
  byId: Partial<Record<FactionId, FactionMeta>>
  schemaVersion: string | null
  loadedAt: number | null
  source: FactionMetaSource
  applyFactionsMeta: (payload: FactionMetaPayload) => void
  applyFromRest: (meta: FactionMeta[]) => void
  applyFromMock: (meta: FactionMeta[]) => void
  reset: () => void
}

function toById(meta: FactionMeta[]) {
  return Object.fromEntries(meta.map((faction) => [faction.id, faction])) as Partial<
    Record<FactionId, FactionMeta>
  >
}

function orderedValues(byId: Partial<Record<FactionId, FactionMeta>>) {
  return FACTION_IDS.map((id) => byId[id]).filter((meta): meta is FactionMeta => Boolean(meta))
}

export const factionMetaStore = create<FactionMetaState>((set) => ({
  byId: {},
  schemaVersion: null,
  loadedAt: null,
  source: 'pending',
  applyFactionsMeta: (payload) =>
    set({
      byId: toById(payload.factions_meta),
      schemaVersion: payload.schema_version ?? null,
      loadedAt: Date.now(),
      source: 'ws',
    }),
  applyFromRest: (meta) =>
    set({
      byId: toById(meta),
      schemaVersion: null,
      loadedAt: Date.now(),
      source: 'rest',
    }),
  applyFromMock: (meta) =>
    set({
      byId: toById(meta),
      schemaVersion: 'mock',
      loadedAt: Date.now(),
      source: 'mock',
    }),
  reset: () =>
    set({
      byId: {},
      schemaVersion: null,
      loadedAt: null,
      source: 'pending',
    }),
}))

export function useFactionMeta(id?: FactionId | null): FactionMeta | null {
  return factionMetaStore((state) => (id ? state.byId[id] ?? null : null))
}

export function useAllFactionMeta(): FactionMeta[] {
  return factionMetaStore((state) => orderedValues(state.byId))
}

export function useFactionPrimary(id?: FactionId | null): string {
  return factionMetaStore((state) => (id ? state.byId[id]?.primary ?? '#7b8494' : '#7b8494'))
}
