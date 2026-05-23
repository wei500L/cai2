import { create } from 'zustand'
import type { EpicNarrationPayload, SummaryNarrationPayload } from '@/types'

export type EpochNarrationEntry = {
  epic: EpicNarrationPayload | null
  summary: SummaryNarrationPayload | null
}

type EpochSummaryState = {
  byEpoch: Map<number, EpochNarrationEntry>
  latestEpoch: number | null
  applyEpic: (payload: EpicNarrationPayload) => void
  applySummary: (payload: SummaryNarrationPayload) => void
  reset: () => void
}

const EMPTY_ENTRY: EpochNarrationEntry = {
  epic: null,
  summary: null,
}

function nextEntry(current: EpochNarrationEntry | undefined, patch: Partial<EpochNarrationEntry>) {
  return {
    epic: patch.epic ?? current?.epic ?? null,
    summary: patch.summary ?? current?.summary ?? null,
  }
}

export const epochSummaryStore = create<EpochSummaryState>((set) => ({
  byEpoch: new Map<number, EpochNarrationEntry>(),
  latestEpoch: null,
  applyEpic: (payload) =>
    set((state) => {
      const byEpoch = new Map(state.byEpoch)
      byEpoch.set(payload.epoch, nextEntry(byEpoch.get(payload.epoch), { epic: payload }))

      return {
        byEpoch,
        latestEpoch: payload.epoch,
      }
    }),
  applySummary: (payload) =>
    set((state) => {
      const byEpoch = new Map(state.byEpoch)
      byEpoch.set(payload.epoch, nextEntry(byEpoch.get(payload.epoch), { summary: payload }))

      return {
        byEpoch,
        latestEpoch: payload.epoch,
      }
    }),
  reset: () =>
    set({
      byEpoch: new Map<number, EpochNarrationEntry>(),
      latestEpoch: null,
    }),
}))

export function useEpochNarration(epoch: number | null | undefined): EpochNarrationEntry {
  return epochSummaryStore((state) => {
    if (epoch === null || epoch === undefined) {
      return EMPTY_ENTRY
    }

    return state.byEpoch.get(epoch) ?? EMPTY_ENTRY
  })
}
