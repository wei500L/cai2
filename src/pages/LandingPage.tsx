import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { HoloDivider } from '@/components/HoloDivider'
import { StatusBadge } from '@/components/StatusBadge'
import { BootSequence } from '@/features/landing/BootSequence'
import { EnterButton } from '@/features/landing/EnterButton'
import { ScanlinesOverlay } from '@/features/landing/ScanlinesOverlay'
import { StarfieldCanvas, type ParticleAttractor } from '@/features/landing/StarfieldCanvas'
import { TitleBlock } from '@/features/landing/TitleBlock'

const bootStorageKey = 'diplomacy.boot-sequence.v1'

const bootAlreadyPlayed = () => {
  if (typeof window === 'undefined') {
    return true
  }

  return window.sessionStorage.getItem(bootStorageKey) === 'complete'
}

export default function LandingPage() {
  const [booting, setBooting] = useState(() => !bootAlreadyPlayed())
  const [attractor, setAttractor] = useState<ParticleAttractor>({ active: false, x: 0, y: 0 })

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__DIPLOMACY_DEBUG__ = window.__DIPLOMACY_DEBUG__ ?? { particleDensity: 1 }
    }
  }, [])

  const completeBoot = useCallback(() => {
    window.sessionStorage.setItem(bootStorageKey, 'complete')
    setBooting(false)
  }, [])

  const handleHoverChange = useCallback((active: boolean, center?: { x: number; y: number }) => {
    setAttractor((current) => ({
      active,
      x: center?.x ?? current.x,
      y: center?.y ?? current.y,
    }))
  }, [])

  const signalRows = useMemo(
    () => [
      ['SIGNAL', 'NLP COMMAND CORE'],
      ['COLONY', 'EDEN-7 ORBITAL NET'],
      ['FACTIONS', '8 CIVILIZATION LINKS'],
    ],
    [],
  )

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:#02040a] text-[color:var(--text-primary)]">
      <StarfieldCanvas attractor={attractor} />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'linear-gradient(90deg, rgba(2,4,10,0.92) 0%, rgba(2,4,10,0.28) 18%, transparent 50%, rgba(2,4,10,0.28) 82%, rgba(2,4,10,0.92) 100%)',
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-20 border border-[color:rgba(75,202,255,0.22)]"
      >
        <div className="absolute left-3 top-3 h-12 w-12 border-l border-t border-[color:rgba(141,235,255,0.62)] sm:left-6 sm:top-6 sm:h-20 sm:w-20" />
        <div className="absolute right-3 top-3 h-12 w-12 border-r border-t border-[color:rgba(141,235,255,0.62)] sm:right-6 sm:top-6 sm:h-20 sm:w-20" />
        <div className="absolute bottom-3 left-3 h-12 w-12 border-b border-l border-[color:rgba(141,235,255,0.62)] sm:bottom-6 sm:left-6 sm:h-20 sm:w-20" />
        <div className="absolute bottom-3 right-3 h-12 w-12 border-b border-r border-[color:rgba(141,235,255,0.62)] sm:bottom-6 sm:right-6 sm:h-20 sm:w-20" />
      </div>

      <section className="relative z-20 grid min-h-screen grid-rows-[auto_1fr_auto] px-4 py-5 sm:px-8 sm:py-7">
        <header className="flex items-start justify-between gap-4 font-hud">
          <div className="min-w-0">
            <p className="text-[0.62rem] uppercase tracking-[0.34em] text-[color:rgba(157,226,244,0.68)] sm:text-xs">
              DIPLOMACY COMMAND ACCESS
            </p>
            <HoloDivider className="mt-3 max-w-[18rem]" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge state="friendly">LINK READY</StatusBadge>
            <StatusBadge state="neutral">2147.EDEN-7</StatusBadge>
          </div>
        </header>

        <div className="grid place-items-center">
          <div className="grid w-full max-w-5xl justify-items-center gap-8 sm:gap-10">
            <TitleBlock bootComplete={!booting} />

            <motion.div
              className="grid justify-items-center gap-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: booting ? 0 : 1, y: booting ? 12 : 0 }}
              transition={{ delay: 0.08, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <EnterButton onHoverChange={handleHoverChange} />
              <div className="grid w-full max-w-[42rem] grid-cols-1 gap-2 border-y border-[color:rgba(83,206,255,0.22)] py-3 font-hud sm:grid-cols-3">
                {signalRows.map(([label, value]) => (
                  <div key={label} className="grid gap-1 px-2 text-center sm:text-left">
                    <span className="text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(156,221,240,0.48)]">
                      {label}
                    </span>
                    <span className="truncate text-[0.68rem] uppercase tracking-[0.16em] text-[color:rgba(232,250,255,0.78)]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <footer className="grid gap-3 font-hud text-[0.6rem] uppercase tracking-[0.26em] text-[color:rgba(155,217,236,0.58)] sm:grid-cols-[1fr_auto_1fr] sm:text-xs">
          <span>VOICE · WHISPER · TREATY · DECLARE</span>
          <span className="hidden text-[color:rgba(86,203,255,0.5)] sm:block">◆</span>
          <span className="sm:text-right">NATURAL LANGUAGE COMMAND ONLY</span>
        </footer>
      </section>

      <ScanlinesOverlay />
      {booting ? <BootSequence onComplete={completeBoot} /> : null}
    </main>
  )
}
