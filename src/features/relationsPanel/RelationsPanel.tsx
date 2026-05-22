import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { GlowPanel } from '@/components/GlowPanel'
import { EmptyState } from '@/components/EmptyState'
import { HoloDivider } from '@/components/HoloDivider'
import { LoadingHologram } from '@/components/LoadingHologram'
import { PixelButton } from '@/components/PixelButton'
import { FactionDetailPanel } from '@/features/factionSelect/FactionDetailPanel'
import { factionById, type FactionId } from '@/mock/factions'
import type { TreatyKind } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { getPhaseLabel, getPhaseUIConfig } from '@/features/phaseSystem/PhaseStateMachine'
import { FactionRow } from './FactionRow'
import { IntelHints } from './IntelHints'
import { getRelationStatus } from './relationVisuals'
import { TreatyList } from './TreatyList'
import { useRelationDelta } from './useRelationDelta'
import type { ContextMenuState, RelationsTab } from './types'

type RelationsPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

const tabLabels: Record<RelationsTab, string> = {
  factions: '势力',
  treaties: '条约',
  intel: '情报',
}

const tabs: RelationsTab[] = ['factions', 'treaties', 'intel']

const treatyDraftKind: TreatyKind = 'non_aggression'

function FilterToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className="inline-flex h-7 items-center gap-2 border border-[color:rgba(255,255,255,0.1)] bg-white/[0.025] px-2 font-hud text-[0.54rem] tracking-[0.1em] text-[color:rgba(196,228,255,0.62)]"
      onClick={() => onChange(!checked)}
    >
      <span
        className="relative h-3 w-6 border"
        style={{
          borderColor: checked ? 'var(--border-glow)' : 'rgba(255,255,255,0.18)',
          background: checked ? 'rgba(51,170,255,0.18)' : 'rgba(0,0,0,0.25)',
        }}
      >
        <span
          className="absolute top-[2px] h-[6px] w-[6px] bg-[color:var(--text-primary)] transition-transform duration-150"
          style={{
            left: 2,
            transform: checked ? 'translateX(12px)' : 'translateX(0)',
            boxShadow: checked ? '0 0 8px rgba(51,170,255,0.72)' : 'none',
          }}
        />
      </span>
      {label}
    </button>
  )
}

export function RelationsPanel({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: RelationsPanelProps) {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const factions = useGameStore((state) => state.factions)
  const relationships = useGameStore((state) => state.relationships)
  const actorId = selectedFactionId ?? 'starlight'
  const setMapFocus = useUIStore((state) => state.setMapFocus)
  const setFocusedPanel = useUIStore((state) => state.setFocusedPanel)
  const setFocusToast = useUIStore((state) => state.setFocusToast)
  const setCommandTerminalDraft = useUIStore((state) => state.setCommandTerminalDraft)
  const hudMode = useUIStore((state) => state.hudMode)
  const [activeTab, setActiveTab] = useState<RelationsTab>('factions')
  const [onlyTreaties, setOnlyTreaties] = useState(false)
  const [onlyHostile, setOnlyHostile] = useState(false)
  const [modalFactionId, setModalFactionId] = useState<FactionId | null>(null)
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const deltas = useRelationDelta(actorId)
  const phaseConfig = getPhaseUIConfig(hudMode)

  const rows = useMemo(() => {
    const relationshipByTarget = new Map(
      relationships
        .filter((relationship) => relationship.from === actorId)
        .map((relationship) => [relationship.to, relationship]),
    )

    return factions
      .map((faction) => {
        const relation =
          faction.id === actorId
            ? { value: 100, treaties: [] as TreatyKind[] }
            : {
                value: relationshipByTarget.get(faction.id)?.value ?? 0,
                treaties: relationshipByTarget.get(faction.id)?.treaties ?? [],
              }

        return {
          factionId: faction.id,
          value: relation.value,
          status: getRelationStatus(relation.value),
          hasTreaty: relation.treaties.length > 0,
        }
      })
      .filter((row) => (onlyTreaties ? row.hasTreaty : true))
      .filter((row) => (onlyHostile ? row.status === 'hostile' : true))
      .sort((a, b) => b.value - a.value)
  }, [actorId, factions, onlyHostile, onlyTreaties, relationships])

  const focusFaction = useCallback(
    (factionId: FactionId) => {
      setMapFocus({ factionId })
      setFocusToast(`已聚焦 ${factionById[factionId].name}`)
    },
    [setFocusToast, setMapFocus],
  )

  const runMenuAction = useCallback(
    (kind: 'speech' | 'private' | 'treaty' | 'intel', factionId: FactionId) => {
      const factionName = factionById[factionId].name

      setFocusedPanel('bottom')
      setCommandTerminalDraft({
        id: Date.now(),
        mode: kind,
        targets: kind === 'speech' ? [] : [factionId],
        treatyKind: kind === 'treaty' ? treatyDraftKind : undefined,
        content:
          kind === 'speech'
            ? `向${factionName}公开喊话：我们愿意重新校准边境与利益边界，但任何挑衅都会被记录。`
            : kind === 'private'
              ? `致${factionName}：我们建议开启一条低调联络线，交换当前局势中的真实底价。`
              : kind === 'treaty'
                ? `我们提议与${factionName}签署互不侵犯条约：本回合冻结敌对行动，并确认边境执行边界。`
                : `派出密使调查${factionName}的兵力调动、贸易线弱点与外交筹码。`,
      })
      setMenu(null)
    },
    [setCommandTerminalDraft, setFocusedPanel],
  )

  const modalFaction = modalFactionId ? factionById[modalFactionId] : null

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalFactionId(null)
        setMenu(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!phaseConfig.relationsVisible || phaseConfig.relationsMode === 'hidden') {
    return null
  }

  if (phaseConfig.relationsMode === 'compact') {
    return (
      <GlowPanel className="h-full rounded-none">
        <div className="flex h-full min-w-0 flex-col">
          <div className="px-3 py-3">
            <div className="truncate font-hud text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--text-primary)]">
              势力关系
            </div>
            <div className="mt-1 truncate font-hud text-[0.5rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.42)]">
              {getPhaseLabel(hudMode)} / 快照
            </div>
          </div>
          <HoloDivider />
          <div className="event-stream-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {factions.length === 0 ? (
              <LoadingHologram label="载入势力关系" />
            ) : (
              <div className="grid gap-2">
                {rows.slice(0, 6).map((row) => (
                <button
                  key={row.factionId}
                  type="button"
                  className="border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.03)] px-2 py-2 text-left"
                  onClick={() => focusFaction(row.factionId)}
                >
                  <div className="truncate font-hud text-[0.54rem] tracking-[0.08em] text-[color:rgba(196,228,255,0.72)]">
                    {factionById[row.factionId].name}
                  </div>
                  <div className="mt-1 h-1 bg-[color:rgba(255,255,255,0.08)]">
                    <div
                      className="h-full bg-[color:var(--border-glow)]"
                      style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
                    />
                  </div>
                </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlowPanel>
    )
  }

  return (
    <GlowPanel className="h-full rounded-none">
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-3 py-3 xl:px-4">
          <div className="min-w-0">
            <div className="truncate font-hud text-[0.7rem] uppercase tracking-[0.22em] text-[color:var(--text-primary)]">
              势力关系
            </div>
            <div className="mt-1 truncate text-[0.56rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.42)]">
              {factionById[actorId].name} 视角
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.54rem] tracking-[0.16em]"
              onClick={onToggleCollapsed}
            >
              {collapsed ? '展开' : '折叠'}
            </PixelButton>
            <PixelButton
              tone="ghost"
              className="hidden px-2 py-1 text-[0.54rem] tracking-[0.16em] xl:inline-flex"
              onClick={onToggleFullscreen}
            >
              全屏
            </PixelButton>
          </div>
        </div>

        <HoloDivider />

        <div className="grid grid-cols-3 gap-1 px-3 py-2 xl:px-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={clsx(
                'h-8 border font-hud text-[0.6rem] tracking-[0.16em] transition-[border-color,background-color,color] duration-150',
                activeTab === tab
                  ? 'bg-[color:rgba(51,170,255,0.13)] text-[color:var(--text-primary)]'
                  : 'bg-[color:rgba(255,255,255,0.025)] text-[color:rgba(196,228,255,0.5)]',
              )}
              style={{
                borderColor: activeTab === tab ? 'var(--border-glow)' : 'rgba(255,255,255,0.1)',
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {activeTab === 'factions' ? (
          <div className="flex flex-wrap gap-2 px-3 pb-2 xl:px-4">
            <FilterToggle checked={onlyTreaties} label="仅有条约" onChange={setOnlyTreaties} />
            <FilterToggle checked={onlyHostile} label="仅敌对" onChange={setOnlyHostile} />
          </div>
        ) : null}

        <div className="event-stream-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3 xl:px-4">
          {factions.length === 0 ? (
            <LoadingHologram label="载入势力关系" className="h-full" />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === 'factions' ? (
              <motion.div
                key="factions"
                className="grid gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <FactionRow
                      key={row.factionId}
                      actorId={actorId}
                      factionId={row.factionId}
                      delta={deltas[row.factionId]}
                      onFocusFaction={focusFaction}
                      onOpenModal={setModalFactionId}
                      onOpenMenu={setMenu}
                    />
                  ))
                ) : (
                  <EmptyState title="无匹配势力" detail="调整过滤条件查看关系网" />
                )}
              </motion.div>
            ) : activeTab === 'treaties' ? (
              <motion.div
                key="treaties"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <TreatyList />
              </motion.div>
            ) : (
              <motion.div
                key="intel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <IntelHints />
              </motion.div>
            )}
            </AnimatePresence>
          )}
        </div>
      </div>

      <AnimatePresence>
        {menu ? (
          <motion.div
            className="fixed z-[80] w-44 border border-[color:rgba(255,255,255,0.16)] bg-[color:rgba(5,9,18,0.96)] p-1 shadow-[0_0_28px_rgba(0,0,0,0.45)]"
            style={{ left: menu.x, top: menu.y } as CSSProperties}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onMouseLeave={() => setMenu(null)}
          >
            {[
              ['speech', '演讲到该势力'],
              ['private', '密谈'],
              ['treaty', '提议条约'],
              ['intel', '派密使'],
            ].map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="block h-8 w-full border border-transparent px-2 text-left font-hud text-[0.58rem] tracking-[0.1em] text-[color:var(--text-primary)] hover:border-[color:var(--border-glow)] hover:bg-[color:rgba(51,170,255,0.12)]"
                onClick={() => runMenuAction(kind as 'speech' | 'private' | 'treaty' | 'intel', menu.factionId)}
              >
                {label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {modalFaction ? (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-black/62 p-4 max-sm:p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalFactionId(null)}
          >
            <motion.div
              className="w-[min(92vw,32rem)] max-sm:h-screen max-sm:w-screen"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="h-8 border border-[color:rgba(255,255,255,0.16)] bg-black/60 px-3 font-hud text-[0.58rem] tracking-[0.14em] text-[color:var(--text-primary)]"
                  onClick={() => setModalFactionId(null)}
                >
                  关闭
                </button>
              </div>
              <FactionDetailPanel faction={modalFaction} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlowPanel>
  )
}
