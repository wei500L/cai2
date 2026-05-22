import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { factionById } from '@/mock/factions'
import { useGameStore } from '@/store/gameStore'

function factionName(id?: string) {
  return id && id in factionById ? factionById[id as keyof typeof factionById].name : '未知目标'
}

export function KeyBetrayals() {
  const epochId = useGameStore((state) => state.epoch.id)
  const events = useGameStore((state) => state.events)
  const betrayals = useMemo(
    () =>
      events
        .filter((event) => event.epoch === epochId && event.kind === 'betrayal')
        .sort((a, b) => a.createdAt - b.createdAt),
    [epochId, events],
  )

  return (
    <motion.section
      initial={{ opacity: 0, x: 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 1.08, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[color:rgba(180,126,68,0.44)] bg-[color:rgba(22,13,6,0.68)] p-3 shadow-[0_0_42px_rgba(80,42,16,0.22)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[color:rgba(255,231,184,0.12)] pb-2 font-hud">
        <h2 className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:rgba(255,231,184,0.9)]">
          关键背叛
        </h2>
        <span className="text-[0.56rem] tracking-[0.18em] text-[color:rgba(255,231,184,0.46)]">
          {betrayals.length}
        </span>
      </div>
      <div className="grid max-h-[22vh] gap-2 overflow-y-auto pr-1 lg:max-h-[28vh]">
        {betrayals.length > 0 ? (
          betrayals.map((event) => (
            <article key={event.id} className="border border-[color:rgba(255,231,184,0.12)] bg-[color:rgba(6,4,2,0.42)] p-2">
              <div className="font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(255,204,102,0.78)]">
                {factionName(event.actor)} / {factionName(event.target)}
              </div>
              <p className="mt-1 font-sans text-[0.78rem] leading-5 text-[color:rgba(255,242,218,0.86)]">
                {event.narration}
              </p>
            </article>
          ))
        ) : (
          <div className="border border-[color:rgba(255,231,184,0.1)] bg-[color:rgba(6,4,2,0.34)] p-4 text-center font-sans text-[0.82rem] text-[color:rgba(255,231,184,0.58)]">
            本纪元没有背叛记录。
          </div>
        )}
      </div>
    </motion.section>
  )
}
