import { motion } from 'framer-motion'
import type { FactionMeta } from '@/types/faction'
import type { FactionState } from '@/types'
import type { DiaryEntry } from '@/protocol/types'
import { useGameStore } from '@/store/gameStore'
import { metricLabels, treatyIcons, treatyLabels } from './relationVisuals'
import type { TreatyDisplay } from './types'

type FactionRowDetailProps = {
  faction: FactionMeta
  factionState: FactionState
  treaties: TreatyDisplay[]
  isSelf: boolean
}

const metricKeys = ['military', 'economy', 'diplomacy', 'culture'] as const

function MetricBar({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const width = `${Math.min(100, Math.max(0, (value / 150) * 100))}%`

  return (
    <div className="grid grid-cols-[3.1rem_minmax(0,1fr)_2.3rem] items-center gap-2">
      <span className="font-hud text-[0.56rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.48)]">
        {label}
      </span>
      <div className="h-1.5 overflow-hidden border border-[color:rgba(255,255,255,0.1)] bg-black/35">
        <motion.div
          className="h-full"
          style={{
            width,
            background: `linear-gradient(90deg, ${color}, rgba(255,255,255,0.78))`,
            boxShadow: `0 0 10px ${color}`,
          }}
          initial={{ width: 0 }}
          animate={{ width }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>
      <span className="text-right font-mono text-[0.58rem] text-[color:var(--text-primary)]">
        {value}
      </span>
    </div>
  )
}

export function FactionRowDetail({
  faction,
  factionState,
  treaties,
  isSelf,
}: FactionRowDetailProps) {
  const hasDiariesRevealed = useGameStore((state) => state.hasDiariesRevealed())
  const latestDiary = useGameStore((state) => {
    const entries = state.aiDiaries[faction.id]
    return entries && entries.length > 0 ? entries[entries.length - 1] : null
  })
  const diaryPreview = latestDiary ? formatDiaryPreview(latestDiary) : null

  return (
    <motion.div
      className="grid gap-3 border-t border-[color:rgba(255,255,255,0.08)] px-3 pb-3 pt-2"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="grid gap-1.5">
        {metricKeys.map((key) => (
          <MetricBar
            key={key}
            label={metricLabels[key]}
            value={factionState[key]}
            color={faction.glow}
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap gap-1.5">
        {isSelf ? (
          <span className="border border-[color:rgba(255,255,255,0.12)] bg-white/[0.03] px-2 py-1 font-hud text-[0.56rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.54)]">
            本势力基准
          </span>
        ) : treaties.length ? (
          treaties.map((treaty) => (
            <span
              key={`${treaty.kind}-${treaty.turnsLeft}`}
              className="inline-flex items-center gap-1 border px-2 py-1 font-hud text-[0.56rem] tracking-[0.1em] text-[color:var(--text-primary)]"
              style={{
                borderColor: 'rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.035)',
              }}
            >
              <span>{treatyIcons[treaty.kind]}</span>
              {treatyLabels[treaty.kind]}
              <span className="text-[color:rgba(196,228,255,0.52)]">{treaty.turnsLeft} 回合</span>
            </span>
          ))
        ) : (
          <span className="border border-dashed border-[color:rgba(255,255,255,0.12)] px-2 py-1 font-hud text-[0.56rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.42)]">
            无现行条约
          </span>
        )}
      </div>

      <div className="grid gap-1.5 text-[0.72rem] leading-5 text-[color:var(--text-muted)]">
        <div className="flex items-center gap-2">
          <span className="font-hud text-[0.56rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.46)]">
            原型
          </span>
          <span className="text-[color:var(--text-primary)]">{faction.archetype}</span>
        </div>
        <p className="line-clamp-2">{faction.speech_style_description}</p>
      </div>

      <div className="border-t border-[color:rgba(153,51,255,0.16)] pt-2">
        <div className="mb-1 font-hud text-[0.56rem] tracking-[0.16em] text-[color:rgba(220,196,255,0.72)]">
          最近想法
        </div>
        {hasDiariesRevealed && diaryPreview ? (
          <p className="text-[0.68rem] leading-5 text-[color:rgba(244,235,255,0.88)]">
            <span className="font-hud text-[0.55rem] text-[color:rgba(220,196,255,0.58)]">
              {diaryPreview.meta}
            </span>
            <span className="mx-1 text-[color:rgba(196,228,255,0.42)]">/</span>
            {diaryPreview.text}
          </p>
        ) : (
          <p className="italic text-[0.68rem] leading-5 text-[color:rgba(196,228,255,0.38)]">
            此势力的想法仍是迷雾
          </p>
        )}
      </div>
    </motion.div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatDiaryPreview(entry: DiaryEntry) {
  return {
    meta: `E${entry.epoch}.T${entry.turn} · ${entry.emotion}`,
    text: truncateDiaryText(entry.internal_thought),
  }
}

function truncateDiaryText(text: string) {
  if (text.length <= 80) {
    return text
  }

  return `${text.slice(0, 77)}...`
}
