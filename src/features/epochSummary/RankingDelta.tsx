import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { factionById } from '@/mock/factions'
import type { FactionId, FactionState, GameEvent } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

type RankingRow = {
  id: FactionId
  name: string
  totalPower: number
  previousRank: number
  currentRank: number
  rankDelta: number
  previousPower: number
}

function numberFromPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function moraleDeltaFor(event: GameEvent, id: FactionId) {
  const shift = event.payload.morale_shift

  if (typeof shift === 'number') {
    return event.actor === id ? shift : event.target === id ? -shift : 0
  }

  if (!shift || typeof shift !== 'object') {
    return 0
  }

  const attacker = 'attacker' in shift && typeof shift.attacker === 'number' ? shift.attacker : 0
  const defender = 'defender' in shift && typeof shift.defender === 'number' ? shift.defender : 0

  if (event.actor === id) {
    return attacker
  }

  if (event.target === id) {
    return defender
  }

  return 0
}

function estimatePreviousPower(faction: FactionState, events: GameEvent[]) {
  let previousPower = faction.totalPower

  for (const event of events) {
    if (event.kind === 'battle') {
      if (event.actor === faction.id) {
        previousPower += numberFromPayload(event.payload, 'atk_loss')
      }

      if (event.target === faction.id) {
        previousPower += numberFromPayload(event.payload, 'def_loss')
      }

      previousPower -= moraleDeltaFor(event, faction.id)
    }

    if (event.kind === 'speech' && event.actor === faction.id) {
      previousPower -= numberFromPayload(event.payload, 'culture_gain')
    }
  }

  return Math.max(0, Math.round(previousPower))
}

function rankByPower(items: Array<{ id: FactionId; totalPower: number }>) {
  return new Map(
    [...items]
      .sort((a, b) => b.totalPower - a.totalPower)
      .map((item, index) => [item.id, index + 1]),
  )
}

function createRankingRows(factions: FactionState[], events: GameEvent[], epochId: number): RankingRow[] {
  const epochEvents = events.filter((event) => event.epoch === epochId)
  const currentRanks = rankByPower(factions)
  const previousPowers = factions.map((faction) => ({
    id: faction.id,
    totalPower: estimatePreviousPower(faction, epochEvents),
  }))
  const previousRanks = rankByPower(previousPowers)

  return factions
    .map((faction) => {
      const previousPower = previousPowers.find((item) => item.id === faction.id)?.totalPower ?? faction.totalPower
      const previousRank = previousRanks.get(faction.id) ?? factions.length
      const currentRank = currentRanks.get(faction.id) ?? factions.length

      return {
        id: faction.id,
        name: factionById[faction.id].name,
        totalPower: faction.totalPower,
        previousRank,
        currentRank,
        rankDelta: previousRank - currentRank,
        previousPower,
      }
    })
    .sort((a, b) => a.currentRank - b.currentRank)
}

export function RankingDelta() {
  const epochId = useGameStore((state) => state.epoch.id)
  const factions = useGameStore((state) => state.factions)
  const events = useGameStore((state) => state.events)
  const rows = useMemo(() => createRankingRows(factions, events, epochId), [epochId, events, factions])
  const maxPower = Math.max(1, ...rows.map((row) => row.totalPower))

  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 1.02, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[color:rgba(180,126,68,0.44)] bg-[color:rgba(18,10,5,0.7)] p-3 shadow-[0_0_42px_rgba(80,42,16,0.22)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[color:rgba(255,231,184,0.12)] pb-2 font-hud">
        <h2 className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:rgba(255,231,184,0.9)]">
          势力排名变动
        </h2>
        <span className="text-[0.56rem] tracking-[0.18em] text-[color:rgba(255,231,184,0.46)]">
          POWER DELTA
        </span>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => {
          const width = `${Math.max(8, (row.totalPower / maxPower) * 100)}%`
          const trend = row.rankDelta > 0 ? 'up' : row.rankDelta < 0 ? 'down' : 'same'

          return (
            <div key={row.id} className="grid grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-2">
              <div className="font-hud text-[0.62rem] text-[color:rgba(255,231,184,0.54)]">
                #{row.previousRank}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 font-hud text-[0.58rem] tracking-[0.12em]">
                  <span className="truncate text-[color:rgba(255,242,218,0.86)]">{row.name}</span>
                  <span
                    className={
                      trend === 'up'
                        ? 'text-[color:rgba(125,255,164,0.9)]'
                        : trend === 'down'
                          ? 'text-[color:rgba(255,118,108,0.9)]'
                          : 'text-[color:rgba(255,231,184,0.48)]'
                    }
                  >
                    {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                    {Math.abs(row.rankDelta)}
                  </span>
                </div>
                <div className="h-2 border border-[color:rgba(255,231,184,0.1)] bg-[color:rgba(0,0,0,0.36)]">
                  <motion.div
                    className="h-full bg-[linear-gradient(90deg,rgba(139,83,35,0.72),rgba(255,204,102,0.92))] shadow-[0_0_14px_rgba(255,204,102,0.36)]"
                    initial={{ width: 0 }}
                    animate={{ width }}
                    transition={{ duration: 0.72, delay: 1.12, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <div className="mt-1 font-hud text-[0.5rem] tracking-[0.1em] text-[color:rgba(255,231,184,0.38)]">
                  {row.previousPower} → {row.totalPower}
                </div>
              </div>
              <div className="text-right font-hud text-[0.62rem] text-[color:rgba(255,231,184,0.78)]">
                #{row.currentRank}
              </div>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}
