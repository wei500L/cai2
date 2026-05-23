import { useFactionMeta } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'

const fallbackHints = [
  '暗潮商会 hover 关系，疑似正在评估贸易线代价',
  '灰烬部族持续敌对 3 回合，边境冲突概率上升',
  '虚空教廷文化指数异常，公开宣言可能触发连锁反应',
]

export function IntelHints() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const actorMeta = useFactionMeta(selectedFactionId)
  const actorName = actorMeta?.name ?? selectedFactionId ?? '星辉联邦'

  return (
    <div className="grid gap-3">
      <div className="border border-[color:rgba(51,170,255,0.16)] bg-[color:rgba(51,170,255,0.05)] p-3">
        <div className="font-hud text-[0.62rem] tracking-[0.18em] text-[color:rgba(196,228,255,0.62)]">
          已知情报 / {actorName}
        </div>
      </div>

      {fallbackHints.map((hint, index) => (
        <div
          key={hint}
          className="grid grid-cols-[1.8rem_minmax(0,1fr)] gap-2 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.025)] px-3 py-3"
        >
          <span className="font-mono text-[0.68rem] text-[color:rgba(196,228,255,0.42)]">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-[0.72rem] leading-5 text-[color:var(--text-muted)]">{hint}</span>
        </div>
      ))}
    </div>
  )
}
