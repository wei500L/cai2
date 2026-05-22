import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { StatusBadge } from '@/components/StatusBadge'
import { factionById } from '@/mock/factions'
import type { RelationState } from '@/components/hudTheme'
import { PixelButton } from '@/components/PixelButton'
import type { RelationshipStatus, TreatyKind } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

type RelationsPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

const statusLabels: Record<RelationshipStatus, string> = {
  hostile: '敌对',
  wary: '警惕',
  neutral: '中立',
  friendly: '友好',
  allied: '同盟',
}

const treatyLabels: Record<TreatyKind, string> = {
  non_aggression: '互不侵犯',
  trade: '贸易',
  alliance: '同盟',
  ceasefire: '停火',
}

function getBadgeState(status: RelationshipStatus): RelationState {
  if (status === 'allied') {
    return 'ally'
  }

  if (status === 'friendly') {
    return 'friendly'
  }

  if (status === 'hostile') {
    return 'hostile'
  }

  return 'neutral'
}

export function RelationsPanel({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: RelationsPanelProps) {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const relationships = useGameStore((state) => state.relationships)
  const activeFactionId = selectedFactionId ?? 'starlight'
  const visibleRelationships = relationships.filter(
    (relationship) => relationship.from === activeFactionId,
  )

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
            {visibleRelationships.map((relationship) => {
              const faction = factionById[relationship.to]
              const treatyText =
                relationship.treaties.length > 0
                  ? relationship.treaties.map((treaty) => treatyLabels[treaty]).join(' / ')
                  : '无条约'

              return (
                <div
                  key={`${relationship.from}_${relationship.to}`}
                  className="flex items-center justify-between gap-3 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[0.72rem] text-[color:var(--text-primary)]">
                      {faction.name}
                    </div>
                    <div className="mt-1 text-[0.54rem] uppercase tracking-[0.2em] text-[color:rgba(196,228,255,0.44)]">
                      {relationship.value} · {treatyText}
                    </div>
                  </div>
                  <StatusBadge state={getBadgeState(relationship.status)}>
                    {statusLabels[relationship.status]}
                  </StatusBadge>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
