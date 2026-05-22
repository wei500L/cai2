import { create } from 'zustand'

export type HudMode = 'observe' | 'action' | 'resolve' | 'arbitrate'
export type HudFocusTarget = 'left' | 'center' | 'right' | 'bottom'

type UIStoreState = {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  hudMode: HudMode
  focusedPanel: HudFocusTarget
  setLeftPanelOpen: (open: boolean) => void
  toggleLeftPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  toggleRightPanel: () => void
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
