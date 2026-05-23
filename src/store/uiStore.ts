import { create } from 'zustand'
import type { FactionId } from '@/mock/factions'
import type { TreatyKind } from '@/mock/types'
import type { CommandMode } from '@/features/commandTerminal/types'
import type { HudMode } from '@/features/phaseSystem/PhaseStateMachine'
import type { TransportStatus } from '@/protocol/transport'

export type HudFocusTarget = 'left' | 'center' | 'right' | 'bottom'
export type EventFilter = 'all' | 'P0' | 'P1' | 'mine'
export type EventStreamScrollMode = 'auto' | 'manual'
export type MapQuality = 'low' | 'mid' | 'high'
export type GlobalParticleDensity = 'low' | 'mid' | 'high' | 'ultra'
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
  mapQuality: MapQuality
  globalParticleDensity: GlobalParticleDensity
  devOverlayOpen: boolean
  hotkeysHelpOpen: boolean
  settingsOpen: boolean
  eventStreamFullscreen: boolean
  effectsDegraded: boolean
  perfFps: number
  perfParticleCount: number
  phaseDurationScale: number
  mapFocus: MapFocus
  focusToast: string | null
  lastError: string | null
  commandModeHotkey: CommandMode | null
  commandTerminalDraft: CommandTerminalDraft | null
  eventStreamScrollMode: EventStreamScrollMode
  connectionStatus: TransportStatus
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
  setMapQuality: (quality: MapQuality) => void
  setGlobalParticleDensity: (density: GlobalParticleDensity) => void
  degradeParticleDensity: () => void
  setDevOverlayOpen: (open: boolean) => void
  toggleDevOverlay: () => void
  setHotkeysHelpOpen: (open: boolean) => void
  toggleHotkeysHelp: () => void
  setSettingsOpen: (open: boolean) => void
  toggleSettings: () => void
  setEventStreamFullscreen: (open: boolean) => void
  toggleEventStreamFullscreen: () => void
  setEffectsDegraded: (degraded: boolean) => void
  setPerfStats: (stats: { fps?: number; particleCount?: number }) => void
  setPhaseDurationScale: (scale: number) => void
  setMapFocus: (focus: MapFocus) => void
  setFocusToast: (message: string | null) => void
  setLastError: (message: string | null) => void
  setCommandModeHotkey: (mode: CommandMode | null) => void
  setCommandTerminalDraft: (draft: CommandTerminalDraft) => void
  setEventStreamScrollMode: (mode: EventStreamScrollMode) => void
  setConnectionStatus: (status: TransportStatus) => void
}

const focusOrder: HudFocusTarget[] = ['left', 'center', 'right', 'bottom']
const densityOrder: GlobalParticleDensity[] = ['low', 'mid', 'high', 'ultra']
const getInitialPanelOpen = () =>
  typeof window === 'undefined' ? true : window.innerWidth >= 960

export const useUIStore = create<UIStoreState>((set) => ({
  leftPanelOpen: getInitialPanelOpen(),
  rightPanelOpen: getInitialPanelOpen(),
  privateDrawerOpen: false,
  unreadPrivateCount: 0,
  hudMode: 'observe',
  focusedPanel: 'center',
  eventFilter: 'all',
  mapQuality: 'mid',
  globalParticleDensity: 'mid',
  devOverlayOpen: false,
  hotkeysHelpOpen: false,
  settingsOpen: false,
  eventStreamFullscreen: false,
  effectsDegraded: false,
  perfFps: 60,
  perfParticleCount: 0,
  phaseDurationScale: 1,
  mapFocus: null,
  focusToast: null,
  lastError: null,
  commandModeHotkey: null,
  commandTerminalDraft: null,
  eventStreamScrollMode: 'auto',
  connectionStatus: 'idle',
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
  setMapQuality: (mapQuality) => {
    set({ mapQuality })
  },
  setGlobalParticleDensity: (globalParticleDensity) => {
    set({ globalParticleDensity })
  },
  degradeParticleDensity: () => {
    set((state) => {
      const currentIndex = densityOrder.indexOf(state.globalParticleDensity)
      return {
        globalParticleDensity: densityOrder[Math.max(0, currentIndex - 1)] ?? 'low',
      }
    })
  },
  setDevOverlayOpen: (devOverlayOpen) => {
    set({ devOverlayOpen })
  },
  toggleDevOverlay: () => {
    set((state) => ({ devOverlayOpen: !state.devOverlayOpen }))
  },
  setHotkeysHelpOpen: (hotkeysHelpOpen) => {
    set({ hotkeysHelpOpen })
  },
  toggleHotkeysHelp: () => {
    set((state) => ({ hotkeysHelpOpen: !state.hotkeysHelpOpen }))
  },
  setSettingsOpen: (settingsOpen) => {
    set({ settingsOpen })
  },
  toggleSettings: () => {
    set((state) => ({ settingsOpen: !state.settingsOpen }))
  },
  setEventStreamFullscreen: (eventStreamFullscreen) => {
    set({ eventStreamFullscreen })
  },
  toggleEventStreamFullscreen: () => {
    set((state) => ({ eventStreamFullscreen: !state.eventStreamFullscreen }))
  },
  setEffectsDegraded: (effectsDegraded) => {
    set({ effectsDegraded })
  },
  setPerfStats: ({ fps, particleCount }) => {
    set((state) => ({
      perfFps: fps ?? state.perfFps,
      perfParticleCount: particleCount ?? state.perfParticleCount,
    }))
  },
  setPhaseDurationScale: (phaseDurationScale) => {
    set({ phaseDurationScale })
  },
  setMapFocus: (mapFocus) => {
    set({ mapFocus })
  },
  setFocusToast: (focusToast) => {
    set({ focusToast })
  },
  setLastError: (lastError) => {
    set({ lastError, focusToast: lastError })
  },
  setCommandModeHotkey: (commandModeHotkey) => {
    set({ commandModeHotkey })
  },
  setCommandTerminalDraft: (commandTerminalDraft) => {
    set({ commandTerminalDraft })
  },
  setEventStreamScrollMode: (eventStreamScrollMode) => {
    set({ eventStreamScrollMode })
  },
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus })
  },
}))
