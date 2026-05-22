import { create } from 'zustand'
import type { FactionId } from '@/mock/factions'

type GameStoreState = {
  selectedFactionId: FactionId | null
  selectFaction: (id: FactionId) => void
  clearFaction: () => void
}

export const useGameStore = create<GameStoreState>((set) => ({
  selectedFactionId: null,
  selectFaction: (selectedFactionId) => {
    set({ selectedFactionId })
  },
  clearFaction: () => {
    set({ selectedFactionId: null })
  },
}))
