import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PixelButton } from '@/components/PixelButton'
import { Scanlines } from '@/components/Scanlines'
import { NarrationBanner } from '@/features/aiSpeech/NarrationBanner'
import { PrivateMessageDrawer } from '@/features/aiSpeech/PrivateMessageDrawer'
import { useAIResponseScheduler } from '@/features/aiSpeech/useAIResponseScheduler'
import { MapStage } from '@/features/hud/MapStage'
import { CommandTerminal } from '@/features/hud/CommandTerminal'
import { EventStreamPanel } from '@/features/hud/EventStreamPanel'
import { RelationsPanel } from '@/features/hud/RelationsPanel'
import { AIThinkingPanel } from '@/features/phaseSystem/AIThinkingPanel'
import { PhaseIndicator } from '@/features/phaseSystem/PhaseIndicator'
import { PhaseTransitionOverlay } from '@/features/phaseSystem/PhaseTransitionOverlay'
import { ResolveEventPlayer } from '@/features/phaseSystem/ResolveEventPlayer'
import { getHudModeFromPhase, getPhaseUIConfig } from '@/features/phaseSystem/PhaseStateMachine'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { startMockGameLoop } from '@/mock/gameLoop'
import EpochSummaryPage from '@/pages/EpochSummaryPage'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

const COMPACT_BREAKPOINT = 960
const DENSE_BREAKPOINT = 1280

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

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
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
  const viewportWidth = useViewportWidth()
  const isCompact = viewportWidth < COMPACT_BREAKPOINT
  const isDense = viewportWidth < DENSE_BREAKPOINT
  const initGame = useGameStore((state) => state.initGame)
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]
  const leftPanelOpen = useUIStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useUIStore((state) => state.rightPanelOpen)
  const focusedPanel = useUIStore((state) => state.focusedPanel)
  const setLeftPanelOpen = useUIStore((state) => state.setLeftPanelOpen)
  const setRightPanelOpen = useUIStore((state) => state.setRightPanelOpen)
  const toggleLeftPanel = useUIStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel)
  const cycleFocusedPanel = useUIStore((state) => state.cycleFocusedPanel)
  const setFocusedPanel = useUIStore((state) => state.setFocusedPanel)
  const focusToast = useUIStore((state) => state.focusToast)
  const setFocusToast = useUIStore((state) => state.setFocusToast)
  const gamePhase = useGameStore((state) => state.epoch.phase)
  const arbitratePhase = useGameStore((state) => state.epoch.arbitratePhase)
  const hudMode = useUIStore((state) => state.hudMode)
  const setHudMode = useUIStore((state) => state.setHudMode)
  const phaseConfig = getPhaseUIConfig(hudMode)

  useAIResponseScheduler()

  useEffect(() => {
    initGame()
    const stopMockGameLoop = startMockGameLoop()

    return () => {
      stopMockGameLoop()
    }
  }, [initGame])

  useEffect(() => {
    const nextHudMode = getHudModeFromPhase(gamePhase, arbitratePhase)

    if (nextHudMode !== hudMode) {
      setHudMode(nextHudMode)
    }
  }, [arbitratePhase, gamePhase, hudMode, setHudMode])

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        cycleFocusedPanel()
      }

      if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        toggleLeftPanel()
        setFocusedPanel('left')
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        toggleRightPanel()
        setFocusedPanel('right')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cycleFocusedPanel, setFocusedPanel, toggleLeftPanel, toggleRightPanel])

  useEffect(() => {
    if (!focusToast) {
      return
    }

    const timer = window.setTimeout(() => setFocusToast(null), 1400)
    return () => window.clearTimeout(timer)
  }, [focusToast, setFocusToast])

  const rootStyle = useMemo(
    () =>
      ({
        '--hud-faction-glow': faction.glow,
        '--hud-faction-shadow': faction.shadow,
      }) as CSSProperties,
    [faction.glow, faction.shadow],
  )

  const leftWidth = phaseConfig.eventStreamMode === 'compact' ? 104 : isDense ? 240 : 280
  const rightWidth = phaseConfig.relationsMode === 'compact' ? 116 : isDense ? 280 : 320
  const bottomHeight =
    phaseConfig.commandTerminalMode === 'hidden'
      ? 0
      : phaseConfig.commandTerminalMode === 'collapsed'
        ? 48
        : 180
  const sideTransition = {
    duration: phaseConfig.transitionMs / 1000,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  const handleStyle = (active: boolean): CSSProperties => ({
    outline: active ? '1px solid var(--border-glow)' : '1px solid transparent',
    outlineOffset: '-1px',
  })

  return (
    <main
      data-screen-shake-root
      className="relative h-screen overflow-hidden bg-[color:var(--bg-space)] text-[color:var(--text-primary)]"
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
      {focusToast ? (
        <div className="pointer-events-none absolute left-4 top-[4.25rem] z-[70] border border-[color:rgba(51,170,255,0.34)] bg-[color:rgba(5,9,18,0.92)] px-3 py-2 font-hud text-[0.62rem] tracking-[0.16em] text-[color:var(--text-primary)] shadow-[0_0_18px_rgba(51,170,255,0.2)]">
          {focusToast}
        </div>
      ) : null}

      <motion.div
        className="relative z-30 grid h-full"
        animate={{ gridTemplateRows: `56px minmax(0, 1fr) ${bottomHeight}px` }}
        transition={sideTransition}
      >
        <PhaseIndicator />

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
