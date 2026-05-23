import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ScrollNumber } from '@/components/ScrollNumber'
import { useFactionMeta } from '@/store/factionMetaStore'
import type { FactionId } from '@/types/faction'
import type { GameEvent } from '@/types'

export type BattleResultCardData = {
  id: string
  event: GameEvent
  attacker: FactionId
  defender: FactionId
  regionId?: string
  atkLoss: number
  defLoss: number
  attackerRemainingTroops: number
  defenderRemainingTroops: number
  territoryCaptured: boolean
  moraleShift: { attacker: number; defender: number }
  narration: string
}

type BattleResultCardProps = {
  card: BattleResultCardData | null
  onClose: (id: string) => void
}

function RollingStat({
  label,
  value,
  prefix,
}: {
  label: string
  value: number
  prefix?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const resetTimer = window.setTimeout(() => setDisplayValue(0), 0)
    const timer = window.setTimeout(() => setDisplayValue(value), 90)
    return () => {
      window.clearTimeout(resetTimer)
      window.clearTimeout(timer)
    }
  }, [value])

  return (
    <div className="border border-[color:rgba(196,228,255,0.12)] bg-[color:rgba(3,6,12,0.58)] px-3 py-2">
      <div className="mb-1 font-hud text-[0.52rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.56)]">
        {label}
      </div>
      <ScrollNumber value={displayValue} prefix={prefix} className="text-base font-bold" duration={0.24} />
    </div>
  )
}

function Avatar({ factionId }: { factionId: FactionId }) {
  const faction = useFactionMeta(factionId)
  const glow = faction?.glow ?? '#8fcaff'
  const name = faction?.name ?? factionId
  return (
    <div
      className="relative grid h-12 w-12 shrink-0 place-items-center border bg-[color:rgba(0,0,0,0.62)] font-hud text-lg font-bold"
      style={{ borderColor: glow, color: glow, boxShadow: `0 0 22px ${glow}` }}
    >
      {name.slice(0, 1)}
      <span className="absolute -bottom-4 left-1/2 w-24 -translate-x-1/2 truncate text-center text-[0.48rem] uppercase tracking-[0.12em] text-[color:rgba(244,251,255,0.64)]">
        {name}
      </span>
    </div>
  )
}

export function BattleResultCard({ card, onClose }: BattleResultCardProps) {
  const attackerMeta = useFactionMeta(card?.attacker)
  const defenderMeta = useFactionMeta(card?.defender)

  useEffect(() => {
    if (!card) {
      return undefined
    }

    const timer = window.setTimeout(() => onClose(card.id), 6_000)
    return () => window.clearTimeout(timer)
  }, [card, onClose])

  if (!card) {
    return <AnimatePresence />
  }

  const attackerGlow = attackerMeta?.glow ?? '#8fcaff'
  const defenderGlow = defenderMeta?.glow ?? '#8fcaff'

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={card.id}
        className="pointer-events-auto absolute right-[7%] top-1/2 z-[58] w-[min(26rem,88vw)] -translate-y-1/2 border border-[color:rgba(255,68,64,0.48)] bg-[color:rgba(0,0,0,0.78)] p-4 shadow-[0_0_40px_rgba(255,42,36,0.24)] backdrop-blur-md"
        initial={{ opacity: 0, x: 46, scale: 0.96, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: 24, scale: 0.98, filter: 'blur(6px)' }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, ${attackerGlow}, #ff3333 48%, ${defenderGlow})`,
            boxShadow: `0 0 24px ${attackerGlow}, 0 0 28px ${defenderGlow}`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute left-0 top-0 h-full w-1/2 opacity-35"
            style={{ background: `linear-gradient(90deg, ${attackerGlow}, transparent)` }}
            animate={{ x: ['-26%', '18%', '-10%'] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'mirror' }}
          />
          <motion.div
            className="absolute right-0 top-0 h-full w-1/2 opacity-35"
            style={{ background: `linear-gradient(270deg, ${defenderGlow}, transparent)` }}
            animate={{ x: ['26%', '-18%', '10%'] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'mirror' }}
          />
        </div>

        <div className="relative">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-hud text-[0.56rem] uppercase tracking-[0.22em] text-[color:#ff6666]">
                BATTLE RESULT
              </div>
              <h3 className="mt-1 text-lg font-bold tracking-0 text-[color:var(--text-primary)]">
                {attackerMeta?.name ?? card.attacker} / {defenderMeta?.name ?? card.defender}
              </h3>
              <div className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.58)]">
                REGION / {card.regionId ?? 'BORDER'}
              </div>
            </div>
            <button
              className="border border-[color:rgba(255,102,102,0.42)] bg-[color:rgba(255,48,42,0.1)] px-2 py-1 font-hud text-[0.58rem] uppercase tracking-[0.16em] text-[color:#ffbbbb] transition hover:bg-[color:rgba(255,48,42,0.18)]"
              type="button"
              onClick={() => onClose(card.id)}
            >
              下一事件 →
            </button>
          </div>

          <div className="mb-5 flex items-center justify-between gap-4">
            <Avatar factionId={card.attacker} />
            <div className="relative h-10 flex-1 overflow-hidden border-y border-[color:rgba(255,80,72,0.2)]">
              <motion.div
                className="absolute left-0 top-1/2 h-2 w-[58%] -translate-y-1/2"
                style={{ background: `linear-gradient(90deg, ${attackerGlow}, #ff3333)` }}
                animate={{ x: ['-70%', '34%', '-24%'] }}
                transition={{ duration: 0.82, repeat: Infinity, repeatType: 'mirror' }}
              />
              <motion.div
                className="absolute right-0 top-1/2 h-2 w-[58%] -translate-y-1/2"
                style={{ background: `linear-gradient(270deg, ${defenderGlow}, #ff3333)` }}
                animate={{ x: ['70%', '-34%', '24%'] }}
                transition={{ duration: 0.82, repeat: Infinity, repeatType: 'mirror' }}
              />
            </div>
            <Avatar factionId={card.defender} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[color:#ff6666]">
            <RollingStat label="ATK LOSS" value={card.atkLoss} prefix="-" />
            <RollingStat label="DEF LOSS" value={card.defLoss} prefix="-" />
            <RollingStat label="ATK LEFT" value={card.attackerRemainingTroops} />
            <RollingStat label="DEF LEFT" value={card.defenderRemainingTroops} />
          </div>

          <div
            className={clsx(
              'mt-3 border px-3 py-2 text-xs leading-5',
              card.territoryCaptured
                ? 'border-[color:rgba(255,72,64,0.56)] bg-[color:rgba(255,32,32,0.12)] text-[color:#ffd3d3]'
                : 'border-[color:rgba(196,228,255,0.1)] text-[color:rgba(196,228,255,0.66)]',
            )}
          >
            {card.territoryCaptured ? (
              <div className="mb-1 flex items-center justify-between font-hud text-[0.62rem] uppercase tracking-[0.18em]">
                <span>领土易主</span>
                <motion.span
                  className="font-bold text-[color:#ff6666]"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: -4, opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
                >
                  +1 区域
                </motion.span>
              </div>
            ) : null}
            {card.narration}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
