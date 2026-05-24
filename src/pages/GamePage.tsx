import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PixelButton } from '@/components/PixelButton'
import { Scanlines } from '@/components/Scanlines'
import { DevPerfOverlay } from '@/components/DevPerfOverlay'
import { ConnectionErrorPanel } from '@/components/ConnectionErrorPanel'
import { ErrorPanel } from '@/components/ErrorPanel'
import { HotkeysHelp } from '@/components/HotkeysHelp'
import { LoadingHologram } from '@/components/LoadingHologram'
import { SettingsPanel } from '@/components/SettingsPanel'
import { NarrationBanner } from '@/features/aiSpeech/NarrationBanner'
import { PrivateMessageDrawer } from '@/features/aiSpeech/PrivateMessageDrawer'
import { MapStage } from '@/features/hud/MapStage'
import { CommandTerminal } from '@/features/hud/CommandTerminal'
import { EventStreamPanel } from '@/features/hud/EventStreamPanel'
import { RelationsPanel } from '@/features/hud/RelationsPanel'
import { TopBar } from '@/features/hud/TopBar'
import { AIThinkingPanel } from '@/features/phaseSystem/AIThinkingPanel'
import { PhaseTransitionOverlay } from '@/features/phaseSystem/PhaseTransitionOverlay'
import { ResolveEventPlayer } from '@/features/phaseSystem/ResolveEventPlayer'
import { getHudModeFromPhase, getPhaseUIConfig } from '@/features/phaseSystem/PhaseStateMachine'
import { factionIds, factionTokens, resolveFactionId } from '@/components/hudTheme'
import EpochSummaryPage from '@/pages/EpochSummaryPage'
import { useFactionMeta } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'
import { useUIStore, type GameFinishedBanner as GameFinishedBannerState } from '@/store/uiStore'
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys'
import { startPerfMonitor } from '@/utils/perfMonitor'
import type { ExplosionKind, WorldGeometryPayload } from '@/protocol/types'

const COMPACT_BREAKPOINT = 960
const DENSE_BREAKPOINT = 1280
const FORCE_MOCK_SESSION_KEY = 'diplomacy_force_mock_once'

function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

function navigateToReplay(roomId: string | null) {
  const query = roomId ? `?room=${encodeURIComponent(roomId)}` : ''
  window.history.pushState(null, '', `/replay${query}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

type SmokeHarnessWindow = typeof window & {
  __DIPLOMACY_SMOKE__?: {
    reset: () => void
    create4v4Room: () => void
    setQuality: (quality: 'low' | 'mid' | 'high') => void
    setRenderer: (renderer: 'globe' | 'r3f' | '2d') => void
    triggerExplosion: (kind: ExplosionKind) => void
    addSpeech: (count: number) => void
    seedExpiredScorched: () => string | null
    advanceTurns: (count: number) => void
    metrics: () => Record<string, unknown>
  }
  __DIPLOMACY_GLOBE_METRICS__?: {
    activeExplosionHandles: () => number
    activeSmokeColumns: () => number
    rendererInfo?: () => {
      drawCalls: number
      triangles: number
      geometries: number
      textures: number
    }
  }
}

function createSmokeWorldGeometry(seed: number): WorldGeometryPayload {
  const regions = useGameStore.getState().regions
  const cells = regions.map((region) => ({
    ...region,
    lat: region.lat ?? region.centerLatLng[0],
    lng: region.lng ?? region.centerLatLng[1],
    hex_id: region.hex_id ?? region.id,
    elevation: region.elevation ?? 0,
  }))

  return {
    seed,
    hex_resolution: 4,
    total_cells: cells.length,
    factions: factionIds.map((id) => {
      const capital = cells.find((region) => region.owner === id) ?? cells[0]

      return {
        id,
        capital_hex_id: capital?.hex_id ?? capital?.id ?? '',
        capital_lat: capital?.lat ?? 0,
        capital_lng: capital?.lng ?? 0,
      }
    }),
    cells,
  }
}

function installSmokeHarness() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return () => undefined
  }

  const target = window as SmokeHarnessWindow
  const roomId = 'globe-smoke-room'
  const now = () => Date.now()

  target.__DIPLOMACY_SMOKE__ = {
    reset: () => {
      useGameStore.getState().initGame(2_026_052_3)
      useGameStore.getState().applyWorldGeometry(createSmokeWorldGeometry(2_026_052_3))
      useMapStore.setState({
        renderer: 'globe',
        scorchedRegions: new Map(),
        explosionQueue: [],
      })
      useUIStore.getState().setMapQuality('mid')
    },
    create4v4Room: () => {
      const humanFactions = factionIds.slice(0, 4)
      const aiFactions = factionIds.slice(4, 8)
      useGameStore.getState()._applyRoomJoined({
        current_player_id: 'smoke-player-0',
        room: {
          id: roomId,
          mode: 'multi_4v4',
          status: 'running',
          players: humanFactions.map((factionId, index) => ({
            player_id: `smoke-player-${index}`,
            display_name: `Smoke P${index + 1}`,
            faction_id: factionId,
            connected: true,
            ready: true,
            ai_takeover: false,
          })),
          ai_factions: aiFactions,
        },
      })
      useGameStore.getState()._applyRoomSnapshot({
        room_id: roomId,
        mode: 'multi_4v4',
        status: 'running',
        players: humanFactions.map((factionId, index) => ({
          player_id: `smoke-player-${index}`,
          display_name: `Smoke P${index + 1}`,
          faction_id: factionId,
          connected: true,
          ready: true,
          ai_takeover: false,
        })),
        ai_factions: aiFactions,
      })
      useGameStore.getState().selectFaction(humanFactions[0])
    },
    setQuality: (quality) => {
      useUIStore.getState().setMapQuality(quality)
    },
    setRenderer: (renderer) => {
      useMapStore.getState().setRenderer(renderer)
    },
    triggerExplosion: (kind) => {
      const state = useGameStore.getState()
      const region = state.regions[(state.events.length + state.epoch.turn) % Math.max(1, state.regions.length)]
      useGameStore.getState().handleExplosion({
        id: `smoke-${kind}-${now()}-${Math.floor(Math.random() * 1000)}`,
        room_id: state.currentRoomId ?? roomId,
        epoch: state.epoch.id,
        turn: state.epoch.turn,
        region_id: region?.id,
        centerLat: region?.lat ?? region?.centerLatLng[0] ?? 0,
        centerLng: region?.lng ?? region?.centerLatLng[1] ?? 0,
        intensity: kind === 'nuke' ? 2.8 : 1.25,
        kind,
        ttl_ms: 4000,
        created_at_ms: now(),
        affected_hex_ids: [region?.hex_id ?? region?.id ?? 'smoke-hex'],
        primary_hex_id: region?.hex_id ?? region?.id ?? 'smoke-hex',
        economic_loss_pct: kind === 'nuke' ? 0.24 : 0.12,
        narrative_hint: `smoke:${kind}`,
      })
    },
    addSpeech: (count) => {
      const state = useGameStore.getState()
      for (let index = 0; index < count; index += 1) {
        useGameStore.getState().pushEvent({
          id: `smoke-speech-${now()}-${index}`,
          createdAt: now(),
          epoch: state.epoch.id,
          turn: state.epoch.turn,
          phase: state.epoch.phase,
          priority: 'P0',
          kind: 'speech',
          actor: factionIds[index % factionIds.length],
          target: factionIds[(index + 1) % factionIds.length],
          payload: { channel: 'public', smoke: true },
          narration: `Smoke speech ${index + 1}`,
        })
      }
    },
    seedExpiredScorched: () => {
      const state = useGameStore.getState()
      const region = state.regions.find((item) => item.hex_id) ?? state.regions[0]
      const hexId = region?.hex_id ?? region?.id ?? null
      if (!hexId) {
        return null
      }

      useMapStore.getState().applyScorchedDiff({
        room_id: state.currentRoomId ?? roomId,
        epoch: state.epoch.id,
        turn: state.epoch.turn,
        changes: [{
          hex_id: hexId,
          scorched_turns_remaining: 1,
          fallout: 0.25,
          scorched_since_turn: state.epoch.turn,
          severity: 0.7,
        }],
      })
      return hexId
    },
    advanceTurns: (count) => {
      const game = useGameStore.getState()
      for (let offset = 1; offset <= count; offset += 1) {
        const current = useGameStore.getState()
        game._applyTurnBegin({
          room_id: current.currentRoomId ?? roomId,
          epoch: current.epoch.id,
          turn: current.epoch.turn + 1,
          phase: 'observe',
          phase_started_at_ms: now(),
          phase_duration_ms: 30_000,
          visible_snapshot: {},
        })
      }
    },
    metrics: () => {
      const game = useGameStore.getState()
      const map = useMapStore.getState()
      const ui = useUIStore.getState()
      return {
        fps: ui.perfFps,
        quality: ui.mapQuality,
        renderer: map.renderer,
        roomMode: game.roomMode,
        roomPlayers: game.roomPlayers.length,
        aiFactions: game.aiFactions.length,
        turn: game.epoch.turn,
        scorchedCount: map.scorchedRegions.size,
        activeExplosionHandles: target.__DIPLOMACY_GLOBE_METRICS__?.activeExplosionHandles() ?? 0,
        activeSmokeColumns: target.__DIPLOMACY_GLOBE_METRICS__?.activeSmokeColumns() ?? 0,
        ...(target.__DIPLOMACY_GLOBE_METRICS__?.rendererInfo?.() ?? {
          drawCalls: 0,
          triangles: 0,
          geometries: 0,
          textures: 0,
        }),
        heapUsed: 'memory' in performance
          ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? null
          : null,
      }
    },
  }

  return () => {
    delete target.__DIPLOMACY_SMOKE__
  }
}

function EpicCurtain({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-[color:rgba(0,0,0,0.88)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(89,55,28,0.36), rgba(0,0,0,0.2)), repeating-linear-gradient(0deg, rgba(255,204,102,0.06) 0, rgba(255,204,102,0.06) 1px, transparent 1px, transparent 5px)',
              filter: 'sepia(0.78) saturate(0.72)',
            }}
          />
          <motion.div
            className="relative border border-[color:rgba(151,106,55,0.58)] bg-[color:rgba(14,8,4,0.72)] px-10 py-7 text-center shadow-[0_0_64px_rgba(151,106,55,0.25)]"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(255,231,184,0.48)]">
              EPIC MOMENT
            </div>
            <div className="mt-3 font-hud text-3xl tracking-[0.18em] text-[color:rgba(255,231,184,0.92)]">
              史诗时刻
            </div>
            <div className="mt-3 font-hud text-[0.72rem] tracking-[0.18em] text-[color:rgba(255,231,184,0.62)]">
              历史正在书写...
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function GamePage() {
  useGlobalHotkeys()
  const viewportWidth = useViewportWidth()
  const isCompact = viewportWidth < COMPACT_BREAKPOINT
  const isMobile = viewportWidth < 640
  const isDense = viewportWidth < DENSE_BREAKPOINT
  const bootstrapEmpty = useGameStore((state) => state.bootstrapEmpty)
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const currentRoomId = useGameStore((state) => state.currentRoomId)
  const gameStatus = useGameStore((state) => state.status)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]
  const leftPanelOpen = useUIStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useUIStore((state) => state.rightPanelOpen)
  const focusedPanel = useUIStore((state) => state.focusedPanel)
  const setLeftPanelOpen = useUIStore((state) => state.setLeftPanelOpen)
  const setRightPanelOpen = useUIStore((state) => state.setRightPanelOpen)
  const toggleLeftPanel = useUIStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel)
  const focusToast = useUIStore((state) => state.focusToast)
  const setFocusToast = useUIStore((state) => state.setFocusToast)
  const lastError = useUIStore((state) => state.lastError)
  const setLastError = useUIStore((state) => state.setLastError)
  const gameFinishedBanner = useUIStore((state) => state.gameFinishedBanner)
  const gameFinishedRedirectAtMs = useUIStore((state) => state.gameFinishedRedirectAtMs)
  const gamePhase = useGameStore((state) => state.epoch.phase)
  const arbitratePhase = useGameStore((state) => state.epoch.arbitratePhase)
  const hudMode = useUIStore((state) => state.hudMode)
  const setHudMode = useUIStore((state) => state.setHudMode)
  const phaseConfig = getPhaseUIConfig(hudMode)
  const [finishNowMs, setFinishNowMs] = useState(() => Date.now())
  const [snapshotTimedOut, setSnapshotTimedOut] = useState(false)
  const [snapshotWaitStartedAt] = useState(() => Date.now())

  useEffect(() => {
    if (useGameStore.getState().status === 'not_started') {
      bootstrapEmpty()
    }
  }, [bootstrapEmpty])

  useEffect(() => {
    const monitor = startPerfMonitor()
    return () => monitor.stop()
  }, [])

  useEffect(() => installSmokeHarness(), [])

  useEffect(() => {
    if (!gameFinishedBanner || gameFinishedRedirectAtMs === null) {
      return undefined
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinishNowMs(Date.now())
    const timer = window.setInterval(() => setFinishNowMs(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [gameFinishedBanner, gameFinishedRedirectAtMs])

  useEffect(() => {
    if (
      !gameFinishedBanner ||
      !gameFinishedBanner.replayAvailable ||
      gameFinishedRedirectAtMs === null
    ) {
      return undefined
    }

    const timer = window.setTimeout(
      () => navigateToReplay(currentRoomId),
      Math.max(0, gameFinishedRedirectAtMs - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [currentRoomId, gameFinishedBanner, gameFinishedRedirectAtMs])

  useEffect(() => {
    const nextHudMode = getHudModeFromPhase(gamePhase, arbitratePhase)

    if (nextHudMode !== hudMode) {
      setHudMode(nextHudMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbitratePhase, gamePhase, setHudMode])

  useEffect(() => {
    if (isCompact) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
      return
    }

    setLeftPanelOpen(true)
    setRightPanelOpen(true)
  }, [isCompact, setLeftPanelOpen, setRightPanelOpen])

  useEffect(() => {
    if (!focusToast) {
      return
    }

    const timer = window.setTimeout(() => setFocusToast(null), 1400)
    return () => window.clearTimeout(timer)
  }, [focusToast, setFocusToast])

  useEffect(() => {
    if (gameStatus === 'not_started') {
      const timer = window.setTimeout(() => setSnapshotTimedOut(true), 10_000)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => setSnapshotTimedOut(false), 0)
    return () => window.clearTimeout(timer)
  }, [gameStatus])

  const leftWidth = phaseConfig.eventStreamMode === 'compact' ? 104 : isDense ? 240 : 280
  const rightWidth = phaseConfig.relationsMode === 'compact' ? 116 : isDense ? 280 : 320
  const bottomHeight =
    phaseConfig.commandTerminalMode === 'hidden'
      ? 0
      : phaseConfig.commandTerminalMode === 'collapsed'
        ? 48
        : isMobile
          ? 260
          : 180
  const sideTransition = {
    duration: phaseConfig.transitionMs / 1000,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  const handleStyle = (active: boolean): CSSProperties => ({
    outline: active ? '1px solid var(--border-glow)' : '1px solid transparent',
    outlineOffset: '-1px',
  })
  const rootStyle = useMemo(
    () =>
      ({
        '--hud-faction-glow': faction.glow,
        '--hud-faction-shadow': faction.shadow,
        '--hud-safe-left': !isCompact && leftPanelOpen && phaseConfig.eventStreamVisible ? `${leftWidth + 12}px` : '0px',
        '--hud-safe-right': !isCompact && rightPanelOpen && phaseConfig.relationsVisible ? `${rightWidth + 12}px` : '0px',
      }) as CSSProperties,
    [
      faction.glow,
      faction.shadow,
      isCompact,
      leftPanelOpen,
      leftWidth,
      phaseConfig.eventStreamVisible,
      phaseConfig.relationsVisible,
      rightPanelOpen,
      rightWidth,
    ],
  )

  if (gameStatus === 'not_started') {
    if (snapshotTimedOut) {
      return (
        <ConnectionErrorPanel
          wsUrl={window.location.origin}
          errorCode="SNAPSHOT_TIMEOUT"
          lastAttemptAt={snapshotWaitStartedAt}
          onRetry={() => window.location.reload()}
          onSwitchToMock={() => {
            window.sessionStorage.setItem(FORCE_MOCK_SESSION_KEY, '1')
            window.location.reload()
          }}
        />
      )
    }

    return (
      <main className="relative grid h-screen place-items-center overflow-hidden bg-[color:var(--bg-space)] pt-6 text-[color:var(--text-primary)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(180deg, rgba(6,10,18,0.96) 0%, rgba(2,4,10,0.98) 100%), repeating-linear-gradient(90deg, rgba(51,170,255,0.035) 0, rgba(51,170,255,0.035) 1px, transparent 1px, transparent 72px), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 72px)',
          }}
        />
        <LoadingHologram label="等待房间初始化..." className="relative z-10 min-h-56 w-[min(28rem,calc(100vw-2rem))]" />
      </main>
    )
  }

  return (
    <main
      data-screen-shake-root
      className="relative h-screen overflow-hidden bg-[color:var(--bg-space)] pt-6 text-[color:var(--text-primary)]"
      style={rootStyle}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(6,10,18,0.96) 0%, rgba(2,4,10,0.98) 100%), repeating-linear-gradient(90deg, rgba(51,170,255,0.035) 0, rgba(51,170,255,0.035) 1px, transparent 1px, transparent 72px), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 72px)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-[color:rgba(51,170,255,0.24)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-[color:rgba(51,170,255,0.16)]"
      />
      <Scanlines className="z-20 opacity-35" />
      <NarrationBanner />
      <PrivateMessageDrawer />
      <PhaseTransitionOverlay />
      <HotkeysHelp />
      <SettingsPanel />
      <DevPerfOverlay />
      {focusToast ? (
        <div className="pointer-events-none absolute left-4 top-[4.25rem] z-[70] border border-[color:rgba(51,170,255,0.34)] bg-[color:rgba(5,9,18,0.92)] px-3 py-2 font-hud text-[0.62rem] tracking-[0.16em] text-[color:var(--text-primary)] shadow-[0_0_18px_rgba(51,170,255,0.2)]">
          {focusToast}
        </div>
      ) : null}
      {lastError ? (
        <div className="fixed right-4 top-20 z-[125] w-[min(24rem,calc(100vw-2rem))]">
          <ErrorPanel message={lastError} onRetry={() => setLastError(null)} onClose={() => setLastError(null)} />
        </div>
      ) : null}
      {gameFinishedBanner ? (
        <GameFinishedRedirectBanner
          banner={gameFinishedBanner}
          redirectAtMs={gameFinishedRedirectAtMs}
          nowMs={finishNowMs}
          roomId={currentRoomId}
        />
      ) : null}

      <motion.div
        className="relative z-30 grid h-full"
        animate={{ gridTemplateRows: `56px minmax(0, 1fr) ${bottomHeight}px` }}
        transition={sideTransition}
      >
        <TopBar />

        <section className="relative min-h-0 overflow-hidden px-2 pt-2 sm:px-3 lg:px-4">
          <div className={isCompact ? 'relative flex h-full min-h-0' : 'flex h-full min-h-0 gap-3'}>
            {!isCompact && leftPanelOpen && phaseConfig.eventStreamVisible ? (
              <motion.div
                layout
                animate={{ width: leftWidth }}
                transition={sideTransition}
                className="min-w-0 flex-none"
              >
                <div style={handleStyle(focusedPanel === 'left')} className="h-full">
                  <EventStreamPanel
                    collapsed={false}
                    onToggleCollapsed={toggleLeftPanel}
                    onToggleFullscreen={() => undefined}
                  />
                </div>
              </motion.div>
            ) : null}

            {!isCompact && !leftPanelOpen && phaseConfig.eventStreamVisible ? (
              <div className="relative flex min-h-0 flex-none" style={{ width: 0 }}>
                <div className="absolute left-0 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2">
                  <PixelButton
                    tone="ghost"
                    className="px-2 py-1 text-[0.56rem] tracking-[0.24em]"
                    onClick={toggleLeftPanel}
                    aria-label="展开事件流"
                  >
                    &lt;&lt;
                  </PixelButton>
                </div>
              </div>
            ) : null}

            <div className="relative flex min-w-0 flex-1 items-center justify-center">
              <div
                className="relative flex h-full w-full min-w-0 items-center justify-center"
                style={handleStyle(focusedPanel === 'center')}
              >
                <MapStage />
                <AIThinkingPanel />
                <ResolveEventPlayer />
                <EpicCurtain visible={phaseConfig.epicCurtainVisible} />
              </div>

              {isCompact && !leftPanelOpen && phaseConfig.eventStreamVisible ? (
                <div className="absolute left-2 top-1/2 z-40 -translate-y-1/2">
                  <PixelButton
                    tone="ghost"
                    className="px-2 py-1 text-[0.56rem] tracking-[0.24em]"
                    onClick={toggleLeftPanel}
                    aria-label="展开事件流"
                  >
                    &lt;&lt;
                  </PixelButton>
                </div>
              ) : null}

              {isCompact && leftPanelOpen && phaseConfig.eventStreamVisible ? (
                <div className="absolute inset-y-0 left-0 z-40 w-[min(82vw,280px)] max-w-full">
                  <div style={handleStyle(focusedPanel === 'left')} className="h-full">
                    <EventStreamPanel
                      collapsed={false}
                      onToggleCollapsed={toggleLeftPanel}
                      onToggleFullscreen={() => undefined}
                    />
                  </div>
                </div>
              ) : null}

              {isCompact && rightPanelOpen && phaseConfig.relationsVisible ? (
                <div className="absolute inset-y-0 right-0 z-40 w-[min(86vw,320px)] max-w-full">
                  <div style={handleStyle(focusedPanel === 'right')} className="h-full">
                    <RelationsPanel
                      collapsed={false}
                      onToggleCollapsed={toggleRightPanel}
                      onToggleFullscreen={() => undefined}
                    />
                  </div>
                </div>
              ) : null}

              {isCompact && !rightPanelOpen && phaseConfig.relationsVisible ? (
                <div className="absolute right-2 top-1/2 z-40 -translate-y-1/2">
                  <PixelButton
                    tone="ghost"
                    className="px-2 py-1 text-[0.56rem] tracking-[0.24em]"
                    onClick={toggleRightPanel}
                    aria-label="展开势力关系"
                  >
                    &gt;&gt;
                  </PixelButton>
                </div>
              ) : null}
            </div>

            {!isCompact && rightPanelOpen && phaseConfig.relationsVisible ? (
              <motion.div
                layout
                animate={{ width: rightWidth }}
                transition={sideTransition}
                className="min-w-0 flex-none"
              >
                <div style={handleStyle(focusedPanel === 'right')} className="h-full">
                  <RelationsPanel
                    collapsed={false}
                    onToggleCollapsed={toggleRightPanel}
                    onToggleFullscreen={() => undefined}
                  />
                </div>
              </motion.div>
            ) : null}

            {!isCompact && !rightPanelOpen && phaseConfig.relationsVisible ? (
              <div className="relative flex min-h-0 flex-none" style={{ width: 0 }}>
                <div className="absolute right-0 top-1/2 z-40 -translate-y-1/2 translate-x-1/2">
                  <PixelButton
                    tone="ghost"
                    className="px-2 py-1 text-[0.56rem] tracking-[0.24em]"
                    onClick={toggleRightPanel}
                    aria-label="展开势力关系"
                  >
                    &gt;&gt;
                  </PixelButton>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <motion.div layout className="overflow-hidden px-2 pb-2 sm:px-3 lg:px-4" transition={sideTransition}>
          <div style={handleStyle(focusedPanel === 'bottom')} className="h-full">
            <CommandTerminal />
          </div>
        </motion.div>
      </motion.div>
      <EpochSummaryPage />
    </main>
  )
}

function GameFinishedRedirectBanner({
  banner,
  redirectAtMs,
  nowMs,
  roomId,
}: {
  banner: GameFinishedBannerState
  redirectAtMs: number | null
  nowMs: number
  roomId: string | null
}) {
  const remainingSeconds =
    redirectAtMs === null ? 0 : Math.max(0, Math.ceil((redirectAtMs - nowMs) / 1000))
  const winnerMeta = useFactionMeta(banner.winner)
  const winnerName = banner.winner ? winnerMeta?.name ?? banner.winner : '胜者未定'

  return (
    <div className="fixed left-1/2 top-5 z-[135] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 border border-[color:rgba(255,204,102,0.48)] bg-[linear-gradient(180deg,rgba(24,13,6,0.96),rgba(7,4,3,0.94))] p-3 shadow-[0_0_44px_rgba(255,204,102,0.18)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(255,204,102,0.72)]">
            纪元终结，复盘即将开启...
          </div>
          <div className="mt-1 text-sm text-[color:rgba(255,250,235,0.92)]">
            {winnerName} · {banner.finalNarration}
          </div>
          <div className="mt-1 font-hud text-[0.58rem] tracking-[0.18em] text-[color:rgba(212,227,235,0.58)]">
            {banner.replayAvailable ? `${remainingSeconds}s 后进入上帝视角` : '复盘生成中'}
          </div>
        </div>
        <PixelButton
          tone="primary"
          disabled={!banner.replayAvailable}
          className="shrink-0 px-4 py-2 text-[0.62rem]"
          onClick={() => navigateToReplay(roomId)}
        >
          立即复盘
        </PixelButton>
      </div>
    </div>
  )
}
