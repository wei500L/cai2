import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PixelButton } from '@/components/PixelButton'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import type { GameEvent } from '@/mock/types'
import { getPhaseUIConfig, isKeyResolveEvent } from './PhaseStateMachine'

type KeyNumber = {
  label: string
  value: number
}

const ignoredNumberKeys = new Set(['createdAt', 'epoch', 'turn'])

function collectNumbers(value: unknown, prefix = '', output: KeyNumber[] = []) {
  if (output.length >= 4 || value === null || value === undefined) {
    return output
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const label = prefix.split('.').filter(Boolean).slice(-2).join(' / ')
    output.push({ label: label || '数值', value })
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumbers(item, `${prefix}.${index}`, output))
    return output
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (!ignoredNumberKeys.has(key)) {
        collectNumbers(item, prefix ? `${prefix}.${key}` : key, output)
      }
    })
  }

  return output
}

function getCurrentTurnEvents(events: GameEvent[], epochId: number, turn: number) {
  const currentTurnEvents = events
    .filter((event) => event.epoch === epochId && event.turn === turn && event.kind !== 'phase_change')
    .sort((a, b) => a.createdAt - b.createdAt)
  const keyEvents = currentTurnEvents.filter(isKeyResolveEvent)

  return keyEvents.length > 0 ? keyEvents : currentTurnEvents
}

export function ResolveEventPlayer() {
  const epoch = useGameStore((state) => state.epoch)
  const events = useGameStore((state) => state.events)
  const hudMode = useUIStore((state) => state.hudMode)
  const config = getPhaseUIConfig(hudMode)
  const scopeKey = `${epoch.id}:${epoch.turn}:${hudMode}`
  const [activeState, setActiveState] = useState({ scopeKey, index: 0 })
  const visibleEvents = useMemo(
    () => getCurrentTurnEvents(events, epoch.id, epoch.turn),
    [epoch.id, epoch.turn, events],
  )
  const activeIndex = activeState.scopeKey === scopeKey ? activeState.index : 0
  const activeEvent = visibleEvents[activeIndex] ?? visibleEvents[0]
  const keyNumbers = activeEvent ? collectNumbers(activeEvent.payload) : []

  useEffect(() => {
    if (!config.resolveEventVisible || visibleEvents.length <= 1) {
      return
    }

    const timer = window.setTimeout(() => {
      setActiveState((current) => ({
        scopeKey,
        index: Math.min((current.scopeKey === scopeKey ? current.index : 0) + 1, visibleEvents.length - 1),
      }))
    }, 6000)

    return () => window.clearTimeout(timer)
  }, [activeIndex, config.resolveEventVisible, scopeKey, visibleEvents.length])

  const goNext = () => {
    setActiveState((current) => {
      const currentIndex = current.scopeKey === scopeKey ? current.index : 0
      return {
        scopeKey,
        index: currentIndex >= visibleEvents.length - 1 ? 0 : currentIndex + 1,
      }
    })
  }

  return (
    <AnimatePresence>
      {config.resolveEventVisible ? (
        <motion.div
          key={`${epoch.id}:${epoch.turn}:resolve-events`}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4 py-4 max-sm:px-0 max-sm:py-0"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="pointer-events-auto w-[min(92vw,36rem)] border border-[color:rgba(255,204,102,0.46)] bg-[color:rgba(7,5,3,0.88)] p-5 shadow-[0_0_46px_rgba(255,204,102,0.2)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-hud text-[0.58rem] uppercase tracking-[0.24em] text-[color:rgba(255,231,184,0.52)]">
                  RESOLUTION PLAYER
                </div>
                <div className="mt-1 font-hud text-xl tracking-[0.16em] text-[color:var(--text-primary)]">
                  结算揭晓
                </div>
              </div>
              <div className="font-mono text-[0.7rem] text-[color:var(--text-warn)]">
                {visibleEvents.length > 0 ? activeIndex + 1 : 0}/{visibleEvents.length}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeEvent ? (
                <motion.div
                  key={activeEvent.id}
                  className="mt-4 border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(255,255,255,0.035)] p-4"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.24 }}
                >
                  <div className="font-hud text-[0.62rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.46)]">
                    {activeEvent.kind} / {activeEvent.priority}
                  </div>
                  <p className="mt-3 text-base leading-7 text-[color:rgba(236,246,255,0.92)]">
                    {activeEvent.narration}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {keyNumbers.length > 0 ? (
                      keyNumbers.map((item) => (
                        <div
                          key={`${item.label}:${item.value}`}
                          className="border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(255,204,102,0.06)] px-3 py-2"
                        >
                          <div className="truncate font-hud text-[0.5rem] uppercase tracking-[0.14em] text-[color:rgba(255,231,184,0.48)]">
                            {item.label}
                          </div>
                          <div className="mt-1 font-mono text-[0.92rem] text-[color:var(--text-warn)]">
                            {Math.round(item.value)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.025)] px-3 py-2 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.46)]">
                        本事件无关键数字
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="mt-4 border border-[color:rgba(255,255,255,0.1)] bg-[color:rgba(255,255,255,0.035)] p-4 text-center font-hud text-[0.68rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.56)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  当前回合暂无可揭晓关键事件
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="h-[3px] min-w-0 flex-1 bg-[color:rgba(255,255,255,0.08)]">
                <motion.div
                  key={activeEvent?.id ?? 'empty'}
                  className="h-full bg-[color:var(--text-warn)]"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 6, ease: 'linear' }}
                  style={{ transformOrigin: 'left' }}
                />
              </div>
              <PixelButton
                tone="ghost"
                className="px-3 py-2 text-[0.56rem] tracking-[0.16em]"
                onClick={goNext}
              >
                下一事件 →
              </PixelButton>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
