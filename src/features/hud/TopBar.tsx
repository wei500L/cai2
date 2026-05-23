import type { CSSProperties } from 'react'
import { ConnectionBadge } from '@/components/ConnectionBadge'
import { PixelButton } from '@/components/PixelButton'
import { ScrollNumber } from '@/components/ScrollNumber'
import { GlowPanel } from '@/components/GlowPanel'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import type { ArbitratePhase, GamePhase } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

const phaseLabels: Record<GamePhase, string> = {
  observe: '态势感知期',
  action: '行动期',
  resolve: '博弈期',
  arbitrate: '裁决阶段',
}

const arbitratePhaseLabels: Record<ArbitratePhase, string> = {
  battle: '战争结算',
  epic: '史诗时刻',
  summary: '纪元总结',
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function TopBar() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const epoch = useGameStore((state) => state.epoch)
  const isPaused = useGameStore((state) => state.isPaused)
  const togglePause = useGameStore((state) => state.togglePause)
  const toggleSettings = useUIStore((state) => state.toggleSettings)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]
  const phaseLabel =
    epoch.phase === 'arbitrate' && epoch.arbitratePhase
      ? `${phaseLabels[epoch.phase]} · ${arbitratePhaseLabels[epoch.arbitratePhase]}`
      : phaseLabels[epoch.phase]

  return (
    <GlowPanel
      tone="faction"
      factionId={factionId}
      className="h-14 border-x-0 border-t-0 rounded-none"
    >
      <div
        className="flex h-14 items-center justify-between gap-3 px-4 font-hud text-[0.72rem] uppercase tracking-[0.18em]"
        style={{ '--hud-faction-glow': faction.glow } as CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[color:rgba(196,228,255,0.58)]">纪元</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.id}</span>
          <span className="text-[color:rgba(196,228,255,0.58)]">· 回合</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.turn}</span>
        </div>

        <div className="min-w-0 flex-1 text-center text-[color:var(--text-primary)]">
          阶段：{phaseLabel}
        </div>

        <div className="flex items-center gap-3">
          <ScrollNumber
            value={formatCountdown(epoch.phaseDurationMs)}
            className="font-mono text-[0.86rem] text-[color:var(--hud-faction-glow)]"
          />
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
