import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { StatusBadge } from '@/components/StatusBadge'
import { FACTIONS } from '@/mock/factions'
import type { RelationState } from '@/components/hudTheme'
import { PixelButton } from '@/components/PixelButton'

type RelationsPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

const relationStates: RelationState[] = [
  'hostile',
  'neutral',
  'friendly',
  'ally',
  'neutral',
  'hostile',
  'friendly',
  'ally',
]

export function RelationsPanel({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: RelationsPanelProps) {
  return (
    <GlowPanel className="h-full rounded-none">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 font-hud text-[0.7rem] uppercase tracking-[0.22em]">
          <span className="text-[color:var(--text-primary)]">势力关系</span>
          <div className="flex items-center gap-2">
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleCollapsed}
            >
              {collapsed ? '展开' : '折叠'}
            </PixelButton>
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleFullscreen}
            >
              全屏
            </PixelButton>
          </div>
        </div>
        <HoloDivider />
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          <div className="grid gap-2">
            {FACTIONS.map((faction, index) => (
              <div
                key={faction.id}
                className="flex items-center justify-between gap-3 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[0.72rem] text-[color:var(--text-primary)]">
                    {faction.name}
                  </div>
                  <div className="mt-1 text-[0.54rem] uppercase tracking-[0.2em] text-[color:rgba(196,228,255,0.44)]">
                    占位关系
                  </div>
                </div>
                <StatusBadge state={relationStates[index % relationStates.length]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
