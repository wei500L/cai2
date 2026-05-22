import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { Scanlines } from '@/components/Scanlines'
import { NarrationBanner } from '@/features/aiSpeech/NarrationBanner'
import { PrivateMessageDrawer } from '@/features/aiSpeech/PrivateMessageDrawer'
import { useAIResponseScheduler } from '@/features/aiSpeech/useAIResponseScheduler'
import { MapStage } from '@/features/hud/MapStage'
import { CommandTerminal } from '@/features/hud/CommandTerminal'
import { EventStreamPanel } from '@/features/hud/EventStreamPanel'
import { RelationsPanel } from '@/features/hud/RelationsPanel'
import { TopBar } from '@/features/hud/TopBar'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { startMockGameLoop } from '@/mock/gameLoop'
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

  useAIResponseScheduler()

  useEffect(() => {
    initGame()
    const stopMockGameLoop = startMockGameLoop()

    return () => {
      stopMockGameLoop()
    }
  }, [initGame])

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

  const rootStyle = useMemo(
    () =>
      ({
        '--hud-faction-glow': faction.glow,
        '--hud-faction-shadow': faction.shadow,
      }) as CSSProperties,
    [faction.glow, faction.shadow],
  )

  const leftWidth = isDense ? 240 : 280
  const rightWidth = isDense ? 280 : 320
  const handleStyle = (active: boolean): CSSProperties => ({
    outline: active ? '1px solid var(--border-glow)' : '1px solid transparent',
    outlineOffset: '-1px',
  })

  return (
    <main
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

      <div className="relative z-30 grid h-full grid-rows-[56px_minmax(0,1fr)_180px]">
        <TopBar />

        <section className="relative min-h-0 overflow-hidden px-2 pt-2 sm:px-3 lg:px-4">
          <div className={isCompact ? 'relative flex h-full min-h-0' : 'flex h-full min-h-0 gap-3'}>
            {!isCompact && leftPanelOpen ? (
              <div style={{ width: leftWidth }} className="min-w-0 flex-none">
                <div style={handleStyle(focusedPanel === 'left')} className="h-full">
                  <EventStreamPanel
                    collapsed={false}
                    onToggleCollapsed={toggleLeftPanel}
                    onToggleFullscreen={() => undefined}
                  />
                </div>
              </div>
            ) : null}

            {!isCompact && !leftPanelOpen ? (
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
              </div>

              {isCompact && !leftPanelOpen ? (
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

              {isCompact && leftPanelOpen ? (
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

              {isCompact && rightPanelOpen ? (
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

              {isCompact && !rightPanelOpen ? (
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

            {!isCompact && rightPanelOpen ? (
              <div style={{ width: rightWidth }} className="min-w-0 flex-none">
                <div style={handleStyle(focusedPanel === 'right')} className="h-full">
                  <RelationsPanel
                    collapsed={false}
                    onToggleCollapsed={toggleRightPanel}
                    onToggleFullscreen={() => undefined}
                  />
                </div>
              </div>
            ) : null}

            {!isCompact && !rightPanelOpen ? (
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

        <div className="px-2 pb-2 sm:px-3 lg:px-4">
          <div style={handleStyle(focusedPanel === 'bottom')} className="h-full">
            <CommandTerminal />
          </div>
        </div>
      </div>
    </main>
  )
}
