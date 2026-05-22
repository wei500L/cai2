import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GameEvent } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

const narrationKinds = new Set<GameEvent['kind']>([
  'narration',
  'phase_change',
  'battle',
  'declare_war',
  'betrayal',
])

function isNarrationEvent(event: GameEvent) {
  return narrationKinds.has(event.kind) || event.priority === 'P0'
}

export function NarrationBanner() {
  const events = useGameStore((state) => state.events)
  const latestNarration = useMemo(() => events.find(isNarrationEvent) ?? null, [events])
  const [visibleEventId, setVisibleEventId] = useState<string | null>(null)

  useEffect(() => {
    if (!latestNarration) {
      return undefined
    }

    setVisibleEventId(latestNarration.id)
    const timer = window.setTimeout(() => setVisibleEventId(null), 4_200)

    return () => window.clearTimeout(timer)
  }, [latestNarration])

  const visible = latestNarration && visibleEventId === latestNarration.id

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={latestNarration.id}
          initial={{ opacity: 0, y: -18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.26 }}
          className="pointer-events-none fixed left-1/2 top-1/2 z-[60] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-[color:rgba(255,204,102,0.48)] bg-[color:rgba(8,6,12,0.94)] px-6 py-4 text-center shadow-[0_0_42px_rgba(255,204,102,0.18)]"
        >
          <div className="mb-2 font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:var(--text-warn)]">
            系统旁白
          </div>
          <div className="font-sans text-[0.95rem] leading-7 text-[color:var(--text-primary)]">
            {latestNarration.narration}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
