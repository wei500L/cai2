import type { CSSProperties } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { ScrollNumber } from '@/components/ScrollNumber'
import { GlowPanel } from '@/components/GlowPanel'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { useGameStore } from '@/store/gameStore'

export function TopBar() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]

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
          <span className="font-mono text-[color:var(--hud-faction-glow)]">III</span>
          <span className="text-[color:rgba(196,228,255,0.58)]">· 回合</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">2</span>
        </div>

        <div className="min-w-0 flex-1 text-center text-[color:var(--text-primary)]">
          阶段：行动期
        </div>

        <div className="flex items-center gap-3">
          <ScrollNumber
            value="01:12"
            className="font-mono text-[0.86rem] text-[color:var(--hud-faction-glow)]"
          />
          <PixelButton tone="ghost" className="px-3 py-1 text-[0.58rem] tracking-[0.22em]">
            设置
          </PixelButton>
        </div>
      </div>
    </GlowPanel>
  )
}
