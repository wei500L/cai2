import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { factionIds, factionLabels, factionTokens, resolveFactionId } from '@/components/hudTheme'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { getPhaseDuration, getPhaseLabel, getPhaseUIConfig } from './PhaseStateMachine'

function hashText(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash)
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function getThinkingProgress(seed: number, elapsedRatio: number) {
  const finishAt = 0.44 + ((seed % 47) / 100)
  const wobble = Math.sin(elapsedRatio * 22 + seed * 0.07) * 2.8
  const raw = easeOutCubic(Math.min(1, elapsedRatio / finishAt)) * 100 + wobble

  return Math.min(100, Math.max(3, Math.round(raw)))
}

export function AIThinkingPanel() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const epoch = useGameStore((state) => state.epoch)
  const hudMode = useUIStore((state) => state.hudMode)
  const config = getPhaseUIConfig(hudMode)
  const totalMs = getPhaseDuration(hudMode)
  const elapsedRatio = totalMs > 0 ? Math.min(1, Math.max(0, 1 - epoch.phaseDurationMs / totalMs)) : 1
  const playerFaction = resolveFactionId(selectedFactionId)
  const aiFactions = factionIds.filter((factionId) => factionId !== playerFaction)

  const rows = useMemo(
    () =>
      aiFactions.map((factionId) => ({
        factionId,
        seed: hashText(`${factionId}:${epoch.id}:${epoch.turn}`),
      })),
    [aiFactions, epoch.id, epoch.turn],
  )

  return (
    <AnimatePresence>
      {config.aiThinkingVisible ? (
        <motion.div
          key={`${epoch.id}:${epoch.turn}:ai-thinking`}
          className="pointer-events-none absolute left-1/2 top-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="border border-[color:rgba(51,170,255,0.42)] bg-[color:rgba(2,6,14,0.86)] p-4 shadow-[0_0_42px_rgba(51,170,255,0.22)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-hud text-[0.58rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.52)]">
                  AI DECISION MATRIX
                </div>
                <div className="mt-1 font-hud text-xl tracking-[0.16em] text-[color:var(--text-primary)]">
                  {getPhaseLabel(hudMode)}期
                </div>
              </div>
              <div className="border border-[color:rgba(255,204,102,0.34)] bg-[color:rgba(255,204,102,0.08)] px-3 py-2 text-right font-hud text-[0.56rem] tracking-[0.16em] text-[color:var(--text-warn)]">
                意图收束 {Math.round(elapsedRatio * 100)}%
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {rows.map(({ factionId, seed }) => {
                const progress = getThinkingProgress(seed, elapsedRatio)
                const complete = progress >= 100
                const token = factionTokens[factionId]

                return (
                  <div
                    key={factionId}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3"
                    style={{ '--ai-glow': token.glow } as CSSProperties}
                  >
                    <div className="truncate font-hud text-[0.68rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.72)]">
                      {factionLabels[factionId]}
                    </div>
                    <div className="relative h-5 overflow-hidden border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(255,255,255,0.035)]">
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,var(--ai-glow),rgba(255,255,255,0.72))]"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.22, ease: 'linear' }}
                      />
                      <div className="absolute inset-0 flex items-center px-2 font-mono text-[0.58rem] tracking-[0.12em] text-[color:rgba(255,255,255,0.78)] mix-blend-screen">
                        {'█'.repeat(Math.max(1, Math.floor(progress / 12.5))).padEnd(8, '░')}
                      </div>
                    </div>
                    <motion.div
                      className="font-hud text-[0.8rem] text-[color:var(--ai-glow)]"
                      animate={complete ? { opacity: 1, scale: 1 } : { opacity: 0.32, scale: 0.82 }}
                      transition={{ duration: 0.18 }}
                    >
                      {complete ? '✓' : '…'}
                    </motion.div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
