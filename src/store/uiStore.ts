import { create } from 'zustand'

export type HudMode = 'observe' | 'action' | 'resolve' | 'arbitrate'
export type HudFocusTarget = 'left' | 'center' | 'right' | 'bottom'

type UIStoreState = {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  privateDrawerOpen: boolean
  unreadPrivateCount: number
  hudMode: HudMode
  focusedPanel: HudFocusTarget
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
}))
