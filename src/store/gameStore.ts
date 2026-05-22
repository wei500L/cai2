import { create } from 'zustand'

type GameStoreState = Record<string, never>

export const useGameStore = create<GameStoreState>()(() => ({}))
