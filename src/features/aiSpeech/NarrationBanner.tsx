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

  return latestNarration ? <NarrationBannerItem key={latestNarration.id} event={latestNarration} /> : null
}

function NarrationBannerItem({ event }: { event: GameEvent }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4_200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: -18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.26 }}
          className="pointer-events-none fixed z-[60] border border-[color:rgba(255,204,102,0.48)] bg-[color:rgba(8,6,12,0.94)] px-6 py-4 text-center shadow-[0_0_42px_rgba(255,204,102,0.18)]"
          style={{
            left: 'calc(50vw + (var(--hud-safe-left, 0px) - var(--hud-safe-right, 0px)) / 2)',
            top: 'calc(56px + 1.25rem)',
            width: 'min(44rem, calc(100vw - var(--hud-safe-left, 0px) - var(--hud-safe-right, 0px) - 2rem))',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="mb-2 font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:var(--text-warn)]">
            系统旁白
          </div>
          <div className="font-sans text-[0.95rem] leading-7 text-[color:var(--text-primary)]">
            {event.narration}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
