import { create } from 'zustand'
import { FACTION_IDS, type FactionId, type FactionMeta } from '@/types/faction'
import type { FactionMetaPayload } from '@/protocol/types'

type FactionMetaSource = 'ws' | 'rest' | 'mock' | 'pending'
type BackendFactionMeta = Partial<FactionMeta> & {
  id: FactionId
  primary_color?: string
  glow_color?: string
  shadow_color?: string
  short_name?: string
  civilization_traits?: string[]
  ai_archetype?: string
  speech_style_label?: string
  intel_capable?: boolean
}

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

function normalizeFactionMeta(meta: BackendFactionMeta): FactionMeta {
  const civilizationTraits = Array.isArray(meta.civilization_traits)
    ? meta.civilization_traits
    : []
  const triggerWords = Array.isArray(meta.trigger_words) ? meta.trigger_words : []

  return {
    id: meta.id,
    name: meta.name ?? meta.short_name ?? meta.id,
    civilization: meta.civilization ?? civilizationTraits.slice(0, 2).join('，'),
    archetype: meta.archetype ?? meta.ai_archetype ?? meta.speech_style_label ?? '',
    advantage: meta.advantage ?? meta.speech_style_label ?? '',
    speech_style: meta.speech_style ?? 'analytical_diplomatic',
    speech_style_description: meta.speech_style_description ?? '',
    slogan: meta.slogan ?? meta.speech_style_label ?? meta.name ?? meta.id,
    trigger_words: triggerWords,
    intel_capable: meta.intel_capable ?? false,
    primary: meta.primary ?? meta.primary_color ?? '#7b8494',
    glow: meta.glow ?? meta.glow_color ?? '#8fcaff',
    shadow: meta.shadow ?? meta.shadow_color ?? 'rgba(51, 170, 255, 0.18)',
  }
}

function toById(meta: BackendFactionMeta[]) {
  return Object.fromEntries(meta.map((faction) => {
    const normalized = normalizeFactionMeta(faction)
    return [normalized.id, normalized]
  })) as Partial<
    Record<FactionId, FactionMeta>
  >
}

function getPayloadFactions(payload: FactionMetaPayload): BackendFactionMeta[] {
  const factions = payload.factions_meta ?? payload.factions ?? []
  return factions as BackendFactionMeta[]
}

function orderedValues(byId: Partial<Record<FactionId, FactionMeta>>) {
  return FACTION_IDS.map((id) => byId[id]).filter((meta): meta is FactionMeta => Boolean(meta))
}

export function createAllFactionMetaSelector() {
  let lastById: Partial<Record<FactionId, FactionMeta>> | null = null
  let lastValues: FactionMeta[] = []

  return (state: Pick<FactionMetaState, 'byId'>) => {
    if (state.byId === lastById) {
      return lastValues
    }

    lastById = state.byId
    lastValues = orderedValues(state.byId)
    return lastValues
  }
}

const selectAllFactionMeta = createAllFactionMetaSelector()

export const factionMetaStore = create<FactionMetaState>((set) => ({
  byId: {},
  schemaVersion: null,
  loadedAt: null,
  source: 'pending',
  applyFactionsMeta: (payload) =>
    set({
      byId: toById(getPayloadFactions(payload)),
      schemaVersion: payload.schema_version ?? null,
      loadedAt: Date.now(),
      source: 'ws',
    }),
  applyFromRest: (meta) =>
    set({
      byId: toById(meta as BackendFactionMeta[]),
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
  return factionMetaStore(selectAllFactionMeta)
}

export function useFactionPrimary(id?: FactionId | null): string {
  return factionMetaStore((state) => (id ? state.byId[id]?.primary ?? '#7b8494' : '#7b8494'))
}
