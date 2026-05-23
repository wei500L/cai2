import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LoadingHologram } from '@/components/LoadingHologram'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { MapStage2D } from '@/render/MapStage2D'
import { useEpochNarration } from '@/store/epochSummaryStore'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { AINarration } from './AINarration'
import { EpochTitle } from './EpochTitle'
import { KeyBetrayals } from './KeyBetrayals'
import { KeyWars } from './KeyWars'
import { MajorEvents } from './MajorEvents'
import { NextEpochButton } from './NextEpochButton'
import { RankingDelta } from './RankingDelta'

export function EpochSummaryPanel() {
  const [exiting, setExiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const currentEpoch = useGameStore((state) => state.epoch.id)
  const hudMode = useUIStore((state) => state.hudMode)
  const visible = hudMode === 'arbitrate-summary'
  const summary = useEpochNarration(currentEpoch).summary

  useEffect(() => {
    if (summary) {
      return undefined
    }

    const timer = window.setTimeout(() => setTimedOut(true), 5_000)
    return () => window.clearTimeout(timer)
  }, [currentEpoch, summary])

  useEffect(() => {
    if (!exiting) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      ActionDispatcher.requestNextEpoch()
    }, 620)

    return () => window.clearTimeout(timer)
  }, [exiting])

  const handleNext = useCallback(() => {
    setExiting(true)
  }, [])

  if (!visible) {
    return null
  }

  return (
    <motion.div
      className="fixed inset-0 z-[120] overflow-hidden bg-black text-[color:var(--text-primary)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: exiting ? 0.5 : 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ background: '#000' }}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-[118vh] w-[118vw] -translate-x-1/2 -translate-y-1/2 scale-[0.85] opacity-55"
          style={{
            filter: 'sepia(0.9) saturate(0.55) contrast(1.12) brightness(0.72) drop-shadow(0 0 34px rgba(255,204,102,0.36))',
          }}
        >
          <MapStage2D qualityOverride="low" interactive={false} />
        </div>
        <div
          className="absolute inset-0 mix-blend-color"
          style={{ background: 'rgba(122, 76, 30, 0.34)' }}
        />
      </motion.div>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(255,231,184,0.1) 0%, rgba(76,42,18,0.18) 35%, rgba(0,0,0,0.78) 100%), linear-gradient(180deg, rgba(74,43,18,0.18), rgba(0,0,0,0.32)), repeating-linear-gradient(0deg, rgba(255,231,184,0.045) 0, rgba(255,231,184,0.045) 1px, transparent 1px, transparent 5px)',
          boxShadow: 'inset 0 0 140px rgba(0,0,0,0.92), inset 0 0 260px rgba(0,0,0,0.74)',
          filter: 'sepia(0.52)',
        }}
      />

      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <EpochTitle />

        {summary ? (
          <>
            <div className="mx-auto grid w-[min(86rem,calc(100vw-2rem))] min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto py-3 lg:grid-cols-[1fr_1.15fr_1fr] lg:overflow-hidden">
              <div className="min-h-0 overflow-hidden">
                <MajorEvents />
              </div>
              <div className="min-h-0 overflow-hidden self-end lg:self-center">
                <RankingDelta />
              </div>
              <div className="grid min-h-0 gap-3 overflow-hidden">
                <KeyWars />
                <KeyBetrayals />
              </div>
            </div>
            <div className="relative z-20 px-4 pb-5">
              <AINarration />
              <NextEpochButton onNext={handleNext} disabled={exiting} />
            </div>
          </>
        ) : timedOut ? (
          <div className="grid flex-1 place-items-center px-4">
            <div className="grid gap-3 text-center">
              <div className="font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(255,204,102,0.82)]">
                史官 AI
              </div>
              <div className="font-sans text-[0.9rem] leading-6 text-[color:rgba(255,242,218,0.92)]">
                旁白生成超时，请刷新
              </div>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center px-4">
            <LoadingHologram label="正在生成纪元旁白..." className="relative z-10 min-h-56 w-[min(28rem,calc(100vw-2rem))]" />
          </div>
        )}
      </div>
    </motion.div>
  )
}
