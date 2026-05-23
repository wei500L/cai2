import { motion } from 'framer-motion'
import { factionMetaStore } from '@/store/factionMetaStore'
import { useEpochNarration } from '@/store/epochSummaryStore'
import { useGameStore } from '@/store/gameStore'

const fallbackGlyph: Record<string, string> = {
  speech: '言',
  private: '密',
  narration: '史',
  declare_war: '战',
  alliance: '盟',
  trade: '贸',
  non_aggression: '和',
  ceasefire: '停',
  betrayal: '叛',
  battle: '战',
  invasion: '侵',
  siege: '围',
  bombing: '轰',
  naval_assault: '海',
  uprising: '乱',
  nuclear_strike: '核',
  economy: '财',
  intel: '情',
  ai_thinking: '思',
  ai_reaction: '应',
  phase_change: '更',
}

function getFactionName(id: string | undefined | null, metaById: ReturnType<typeof factionMetaStore.getState>['byId']) {
  return id ? metaById[id as keyof typeof metaById]?.name ?? id : '未指定'
}

function compactNarration(text: string) {
  return text.length > 42 ? `${text.slice(0, 41)}...` : text
}

export function MajorEvents() {
  const epochId = useGameStore((state) => state.epoch.id)
  const factionMetaById = factionMetaStore((state) => state.byId)
  const summary = useEpochNarration(epochId).summary
  const majorEvents = summary?.highlights.majorEvents ?? []

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
                {fallbackGlyph[event.kind] ?? '史'}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(255,231,184,0.54)]">
                  <span>T{event.turn}</span>
                  <span className="text-[color:rgba(255,204,102,0.84)]">{event.priority}</span>
                  <span className="truncate">{getFactionName(event.actor, factionMetaById)}</span>
                  <span className="text-[color:rgba(255,231,184,0.28)]">/</span>
                  <span className="truncate">{getFactionName(event.target, factionMetaById)}</span>
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
