import { create } from 'zustand'
import type { FactionId } from '@/mock/factions'
import type { TreatyKind } from '@/mock/types'
import type { CommandMode } from '@/features/commandTerminal/types'

export type HudMode = 'observe' | 'action' | 'resolve' | 'arbitrate'
export type HudFocusTarget = 'left' | 'center' | 'right' | 'bottom'
export type EventFilter = 'all' | 'P0' | 'P1' | 'mine'
export type EventStreamScrollMode = 'auto' | 'manual'
export type MapFocus = { regionId?: string; factionId?: FactionId } | null
export type CommandTerminalDraft = {
  id: number
  mode: CommandMode
  targets: FactionId[]
  content: string
  treatyKind?: TreatyKind
}

type UIStoreState = {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  privateDrawerOpen: boolean
  unreadPrivateCount: number
  hudMode: HudMode
  focusedPanel: HudFocusTarget
  eventFilter: EventFilter
  mapFocus: MapFocus
  focusToast: string | null
  commandTerminalDraft: CommandTerminalDraft | null
  eventStreamScrollMode: EventStreamScrollMode
  setLeftPanelOpen: (open: boolean) => void
  toggleLeftPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setPrivateDrawerOpen: (open: boolean) => void
  togglePrivateDrawer: () => void
  incrementUnreadPrivateCount: () => void
  clearUnreadPrivateCount: () => void
  setHudMode: (mode: HudMode) => void
  setFocusedPanel: (panel: HudFocusTarget) => void
  cycleFocusedPanel: () => void
  setEventFilter: (filter: EventFilter) => void
  setMapFocus: (focus: MapFocus) => void
  setFocusToast: (message: string | null) => void
  setCommandTerminalDraft: (draft: CommandTerminalDraft) => void
  setEventStreamScrollMode: (mode: EventStreamScrollMode) => void
}

const focusOrder: HudFocusTarget[] = ['left', 'center', 'right', 'bottom']
const getInitialPanelOpen = () =>
  typeof window === 'undefined' ? true : window.innerWidth >= 960

export const useUIStore = create<UIStoreState>((set) => ({
  leftPanelOpen: getInitialPanelOpen(),
  rightPanelOpen: getInitialPanelOpen(),
  privateDrawerOpen: false,
  unreadPrivateCount: 0,
  hudMode: 'action',
  focusedPanel: 'center',
  eventFilter: 'all',
  mapFocus: null,
  focusToast: null,
  commandTerminalDraft: null,
  eventStreamScrollMode: 'auto',
  setLeftPanelOpen: (leftPanelOpen) => {
    set({ leftPanelOpen })
  },
  toggleLeftPanel: () => {
    set((state) => ({ leftPanelOpen: !state.leftPanelOpen }))
  },
  setRightPanelOpen: (rightPanelOpen) => {
    set({ rightPanelOpen })
  },
  toggleRightPanel: () => {
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen }))
  },
  setPrivateDrawerOpen: (privateDrawerOpen) => {
    set((state) => ({
      privateDrawerOpen,
      unreadPrivateCount: privateDrawerOpen ? 0 : state.unreadPrivateCount,
    }))
  },
  togglePrivateDrawer: () => {
    set((state) => {
      const privateDrawerOpen = !state.privateDrawerOpen
      return {
        privateDrawerOpen,
        unreadPrivateCount: privateDrawerOpen ? 0 : state.unreadPrivateCount,
      }
    })
  },
  incrementUnreadPrivateCount: () => {
    set((state) => ({ unreadPrivateCount: state.unreadPrivateCount + 1 }))
  },
  clearUnreadPrivateCount: () => {
    set({ unreadPrivateCount: 0 })
  },
  setHudMode: (hudMode) => {
    set({ hudMode })
  },
  setFocusedPanel: (focusedPanel) => {
    set({ focusedPanel })
  },
  cycleFocusedPanel: () => {
    set((state) => {
      const currentIndex = focusOrder.indexOf(state.focusedPanel)
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % focusOrder.length : 0
      return { focusedPanel: focusOrder[nextIndex] }
    })
  },
  setEventFilter: (eventFilter) => {
    set({ eventFilter })
  },
  setMapFocus: (mapFocus) => {
    set({ mapFocus })
  },
  setFocusToast: (focusToast) => {
    set({ focusToast })
  },
  setCommandTerminalDraft: (commandTerminalDraft) => {
    set({ commandTerminalDraft })
  },
  setEventStreamScrollMode: (eventStreamScrollMode) => {
    set({ eventStreamScrollMode })
  },
}))
