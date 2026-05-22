import { useMemo } from 'react'
import { factionById, type FactionId } from '@/mock/factions'
import type { TreatyKind } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'
import { getTreatyTurnsLeft, treatyIcons, treatyLabels } from './relationVisuals'

type TreatyEntry = {
  key: string
  kind: TreatyKind
  from: FactionId
  to: FactionId
  turnsLeft: number
}

const treatyOrder: TreatyKind[] = ['alliance', 'trade', 'non_aggression', 'ceasefire']

function pairKey(from: FactionId, to: FactionId, kind: TreatyKind) {
  return `${[from, to].sort().join(':')}:${kind}`
}

export function TreatyList() {
  const relationships = useGameStore((state) => state.relationships)
  const turn = useGameStore((state) => state.epoch.turn)
  const groups = useMemo(() => {
    const unique = new Map<string, TreatyEntry>()

    for (const relationship of relationships) {
      for (const kind of relationship.treaties) {
        const key = pairKey(relationship.from, relationship.to, kind)

        if (unique.has(key)) {
          continue
        }

        unique.set(key, {
          key,
          kind,
          from: relationship.from,
          to: relationship.to,
          turnsLeft: getTreatyTurnsLeft(kind, relationship.from, relationship.to, turn),
        })
      }
    }

    return treatyOrder.map((kind) => ({
      kind,
      entries: Array.from(unique.values())
        .filter((entry) => entry.kind === kind)
        .sort((a, b) => a.turnsLeft - b.turnsLeft),
    }))
  }, [relationships, turn])

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <section
          key={group.kind}
          className="border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.025)] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2 font-hud text-[0.62rem] tracking-[0.18em] text-[color:rgba(196,228,255,0.62)]">
            <span>
              {treatyIcons[group.kind]} {treatyLabels[group.kind]}
            </span>
            <span>{group.entries.length}</span>
          </div>

          <div className="grid gap-2">
            {group.entries.length ? (
              group.entries.map((entry) => (
                <div
                  key={entry.key}
                  className="grid grid-cols-[minmax(0,1fr)_3.3rem] items-center gap-2 border border-[color:rgba(255,255,255,0.07)] bg-black/20 px-2 py-2"
                >
                  <div className="min-w-0 truncate text-[0.68rem] text-[color:var(--text-primary)]">
                    {factionById[entry.from].name} / {factionById[entry.to].name}
                  </div>
                  <div className="text-right font-hud text-[0.58rem] tracking-[0.1em] text-[color:var(--text-warn)]">
                    {entry.turnsLeft} 回合
                  </div>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-[color:rgba(255,255,255,0.08)] px-2 py-2 font-hud text-[0.56rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.36)]">
                暂无记录
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
