import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SYSTEM_NARRATION_TEMPLATES } from '@/mock/aiTemplates'
import type { FactionId, FactionState, GameEvent } from '@/types'
import { factionMetaStore } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'

const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function toRoman(value: number) {
  return romanNumerals[value] ?? String(value)
}

function getFactionName(id: FactionId | undefined, metaById: ReturnType<typeof factionMetaStore.getState>['byId']) {
  return id ? metaById[id]?.name ?? id : '无名势力'
}

function weakestFaction(factions: FactionState[]) {
  return [...factions].sort((a, b) => a.totalPower - b.totalPower)[0]
}

function strongestFaction(factions: FactionState[]) {
  return [...factions].sort((a, b) => b.totalPower - a.totalPower)[0]
}

function getTemplateIndex(epochId: number, eventCount: number, warCount: number, betrayalCount: number) {
  return Math.abs(epochId * 17 + eventCount * 7 + warCount * 5 + betrayalCount * 3)
}

function buildNarration(
  epochId: number,
  factions: FactionState[],
  events: GameEvent[],
  metaById: ReturnType<typeof factionMetaStore.getState>['byId'],
) {
  const epochEvents = events.filter((event) => event.epoch === epochId)
  const warCount = epochEvents.filter((event) => event.kind === 'battle').length
  const betrayalCount = epochEvents.filter((event) => event.kind === 'betrayal').length
  const majorEvent = epochEvents.find((event) => event.priority === 'P0' || event.priority === 'P1')
  const weakest = weakestFaction(factions)
  const strongest = strongestFaction(factions)
  const templates = SYSTEM_NARRATION_TEMPLATES.epoch_summary
  const template = templates[getTemplateIndex(epochId, epochEvents.length, warCount, betrayalCount) % templates.length]

  return template
    .replaceAll('{epoch}', String(epochId))
    .replaceAll('{epochRoman}', toRoman(epochId))
    .replaceAll('{fallenName}', getFactionName(weakest?.id, metaById))
    .replaceAll('{topFactionName}', getFactionName(strongest?.id, metaById))
    .replaceAll('{warCount}', String(warCount))
    .replaceAll('{betrayalCount}', String(betrayalCount))
    .replaceAll('{majorEvent}', majorEvent?.narration ?? '沉默的边境仍在等待下一次裁决')
}

export function AINarration() {
  const epochId = useGameStore((state) => state.epoch.id)
  const factions = useGameStore((state) => state.factions)
  const events = useGameStore((state) => state.events)
  const factionMetaById = factionMetaStore((state) => state.byId)
  const narration = buildNarration(epochId, factions, events, factionMetaById)

  return <TypewriterNarration key={narration} narration={narration} />
}

function TypewriterNarration({ narration }: { narration: string }) {
  const [visibleLength, setVisibleLength] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= narration.length) {
          window.clearInterval(timer)
          return current
        }

        return current + 1
      })
    }, 42)

    return () => window.clearInterval(timer)
  }, [narration])

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 1.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none mx-auto w-[min(50rem,calc(100vw-2rem))] border border-[color:rgba(255,204,102,0.34)] bg-[color:rgba(8,5,2,0.74)] px-4 py-3 text-center shadow-[0_0_36px_rgba(255,204,102,0.14)] backdrop-blur-md"
    >
      <div className="mb-2 font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(255,204,102,0.82)]">
        史官 AI
      </div>
      <p className="min-h-[3rem] font-sans text-[0.9rem] leading-6 text-[color:rgba(255,242,218,0.92)] sm:text-[1rem] sm:leading-7">
        {narration.slice(0, visibleLength)}
        <motion.span
          aria-hidden
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="ml-1 inline-block h-4 w-1 bg-[color:rgba(255,204,102,0.86)] align-[-0.15em]"
        />
      </p>
    </motion.div>
  )
}
