import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { ConnectionBadge } from '@/components/ConnectionBadge'
import { PixelButton } from '@/components/PixelButton'
import { GlowPanel } from '@/components/GlowPanel'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import {
  getPhaseLabel,
  getPhaseProgress,
  getPhaseSubtitle,
  getPhaseUIConfig,
} from './PhaseStateMachine'
import { Countdown } from './Countdown'

export function PhaseIndicator() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const epoch = useGameStore((state) => state.epoch)
  const isPaused = useGameStore((state) => state.isPaused)
  const togglePause = useGameStore((state) => state.togglePause)
  const hudMode = useUIStore((state) => state.hudMode)
  const toggleSettings = useUIStore((state) => state.toggleSettings)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]
  const label = getPhaseLabel(hudMode)
  const subtitle = getPhaseSubtitle(hudMode)
  const config = getPhaseUIConfig(hudMode)
  const progress = getPhaseProgress(epoch, hudMode)

  return (
    <GlowPanel
      tone="faction"
      factionId={factionId}
      className="h-14 border-x-0 border-t-0 rounded-none"
    >
      <div
        className="grid h-14 grid-cols-[minmax(8rem,0.8fr)_minmax(12rem,1.4fr)_auto] items-center gap-3 px-4 font-hud text-[0.72rem] uppercase tracking-[0.18em]"
        style={{ '--hud-faction-glow': faction.glow } as CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[color:rgba(196,228,255,0.58)]">纪元</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.id}</span>
          <span className="text-[color:rgba(196,228,255,0.58)]">· 回合</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.turn}</span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-center gap-3">
            <motion.span
              key={hudMode}
              className="truncate text-center text-[0.86rem] text-[color:var(--text-primary)]"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {label}
            </motion.span>
            <span className="hidden border border-[color:rgba(196,228,255,0.16)] px-2 py-1 text-[0.5rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.54)] lg:inline">
              HUD {config.hudOcclusion}%
            </span>
          </div>
          <div className="mx-auto mt-1 h-[3px] w-full max-w-[22rem] bg-[color:rgba(255,255,255,0.08)]">
            <motion.div
              className="h-full bg-[color:var(--hud-faction-glow)]"
              style={{ transformOrigin: 'left' }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.18, ease: 'linear' }}
            />
          </div>
          <div className="mt-1 hidden truncate text-center text-[0.5rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.42)] sm:block">
            {subtitle}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Countdown remainingMs={epoch.phaseDurationMs} />
          <PixelButton
            tone="ghost"
            className="px-3 py-1 text-[0.58rem] tracking-[0.22em]"
            onClick={togglePause}
          >
            {isPaused ? '继续' : '暂停'}
          </PixelButton>
          <ConnectionBadge />
          <PixelButton
            tone="ghost"
            className="px-2 py-1 text-[0.72rem] tracking-0"
            onClick={toggleSettings}
            aria-label="打开设置"
          >
            ⚙
          </PixelButton>
        </div>
      </div>
    </GlowPanel>
  )
}
