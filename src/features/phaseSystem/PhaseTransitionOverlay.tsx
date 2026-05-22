import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { getPhaseLabel, getPhaseSubtitle } from './PhaseStateMachine'
import type { HudMode } from './PhaseStateMachine'

type OverlayState = {
  id: number
  hudMode: HudMode
}

export function PhaseTransitionOverlay() {
  const hudMode = useUIStore((state) => state.hudMode)
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [typedTitle, setTypedTitle] = useState('')
  const previousMode = useRef(hudMode)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]

  useEffect(() => {
    if (previousMode.current === hudMode) {
      return
    }

    previousMode.current = hudMode
    const nextOverlay = { id: Date.now(), hudMode }
    setOverlay(nextOverlay)
    setTypedTitle('')

    const title = getPhaseLabel(hudMode)
    const typeTimer = window.setInterval(() => {
      setTypedTitle((current) => {
        if (current.length >= title.length) {
          window.clearInterval(typeTimer)
          return current
        }

        return title.slice(0, current.length + 1)
      })
    }, Math.max(24, 260 / title.length))

    const closeTimer = window.setTimeout(() => {
      setOverlay((current) => (current?.id === nextOverlay.id ? null : current))
    }, 600)

    return () => {
      window.clearInterval(typeTimer)
      window.clearTimeout(closeTimer)
    }
  }, [hudMode])

  return (
    <AnimatePresence>
      {overlay ? (
        <motion.div
          key={overlay.id}
          className="pointer-events-none fixed inset-0 z-[90] overflow-hidden bg-[color:rgba(1,3,8,0.46)]"
          style={{ '--phase-glow': faction.glow } as CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-y-0 w-[34vw] skew-x-[-16deg] bg-[linear-gradient(90deg,transparent,var(--phase-glow),rgba(255,255,255,0.82),var(--phase-glow),transparent)] blur-[1px]"
            initial={{ x: '-45vw', opacity: 0 }}
            animate={{ x: '120vw', opacity: [0, 1, 0.45, 0] }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-x-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.22),var(--phase-glow),transparent)]"
            initial={{ y: '-12vh', opacity: 0 }}
            animate={{ y: '110vh', opacity: [0, 0.95, 0.2, 0] }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-80"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent 0, transparent 8px, rgba(255,255,255,0.12) 9px, transparent 10px)',
            }}
          />
          <div className="absolute inset-0 grid place-items-center">
            <motion.div
              className="border border-[color:rgba(255,255,255,0.2)] bg-[color:rgba(0,0,0,0.72)] px-8 py-5 text-center shadow-[0_0_48px_var(--phase-glow)]"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ duration: 0.3, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="font-hud text-[0.56rem] uppercase tracking-[0.28em] text-[color:rgba(196,228,255,0.56)]">
                PHASE SHIFT
              </div>
              <div className="mt-2 min-w-[11rem] font-hud text-2xl tracking-[0.18em] text-[color:var(--text-primary)]">
                {typedTitle}
                <span className="ml-1 text-[color:var(--phase-glow)]">_</span>
              </div>
              <div className="mt-2 font-hud text-[0.58rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.5)]">
                {getPhaseSubtitle(overlay.hudMode)}
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
