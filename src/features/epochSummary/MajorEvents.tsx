import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { factionById } from '@/mock/factions'
import type { GameEvent } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

const fallbackGlyph: Record<GameEvent['kind'], string> = {
  speech: '言',
  private: '密',
  reaction: '应',
  narration: '史',
  treaty: '约',
  military: '令',
  declare_war: '战',
  alliance: '盟',
  trade: '贸',
  betrayal: '叛',
  battle: '战',
  economy: '财',
  intel: '情',
  peace: '和',
  phase_change: '更',
}

function getFactionName(id?: string) {
  return id && id in factionById ? factionById[id as keyof typeof factionById].name : '未指定'
}

function compactNarration(text: string) {
  return text.length > 42 ? `${text.slice(0, 41)}...` : text
}

function selectMajorEvents(events: GameEvent[], epochId: number) {
  const weight = (event: GameEvent) => (event.priority === 'P0' ? 0 : 1)

  return events
    .filter((event) => event.epoch === epochId && (event.priority === 'P0' || event.priority === 'P1'))
    .sort((a, b) => weight(a) - weight(b) || a.createdAt - b.createdAt)
    .slice(0, 5)
    .sort((a, b) => a.createdAt - b.createdAt || a.turn - b.turn)
}

export function MajorEvents() {
  const epochId = useGameStore((state) => state.epoch.id)
  const events = useGameStore((state) => state.events)
  const majorEvents = useMemo(() => selectMajorEvents(events, epochId), [epochId, events])

  return (
    <motion.section
      initial={{ opacity: 0, x: -34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.92, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[color:rgba(180,126,68,0.44)] bg-[color:rgba(22,13,6,0.68)] p-3 shadow-[0_0_42px_rgba(80,42,16,0.22)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[color:rgba(255,231,184,0.12)] pb-2 font-hud">
        <h2 className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:rgba(255,231,184,0.9)]">
          重大事件
        </h2>
        <span className="text-[0.56rem] tracking-[0.18em] text-[color:rgba(255,231,184,0.46)]">
          P0 / P1
        </span>
      </div>
      <div className="grid gap-2">
        {majorEvents.length > 0 ? (
          majorEvents.map((event) => (
            <article
              key={event.id}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border border-[color:rgba(255,231,184,0.12)] bg-[color:rgba(6,4,2,0.42)] p-2"
            >
              <div className="grid h-8 w-8 place-items-center border border-[color:rgba(255,204,102,0.28)] bg-[color:rgba(255,204,102,0.08)] font-hud text-[0.78rem] text-[color:rgba(255,222,158,0.94)]">
                {fallbackGlyph[event.kind]}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(255,231,184,0.54)]">
                  <span>T{event.turn}</span>
                  <span className="text-[color:rgba(255,204,102,0.84)]">{event.priority}</span>
                  <span className="truncate">{getFactionName(event.actor)}</span>
                  <span className="text-[color:rgba(255,231,184,0.28)]">/</span>
                  <span className="truncate">{getFactionName(event.target)}</span>
                </div>
                <p className="mt-1 font-sans text-[0.78rem] leading-5 text-[color:rgba(255,242,218,0.86)]">
                  {compactNarration(event.narration)}
                </p>
              </div>
            </article>
          ))
        ) : (
          <div className="border border-[color:rgba(255,231,184,0.1)] bg-[color:rgba(6,4,2,0.34)] p-4 text-center font-sans text-[0.82rem] text-[color:rgba(255,231,184,0.58)]">
            本纪元没有 P0 / P1 事件入册。
          </div>
        )}
      </div>
    </motion.section>
  )
}
