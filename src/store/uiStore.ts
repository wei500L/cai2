import { create } from 'zustand'

type UIStoreState = Record<string, never>

export const useUIStore = create<UIStoreState>()(() => ({}))
