import { motion } from 'framer-motion'
import { factionMetaStore } from '@/store/factionMetaStore'
import { useEpochNarration } from '@/store/epochSummaryStore'
import { useGameStore } from '@/store/gameStore'

export function KeyWars() {
  const epochId = useGameStore((state) => state.epoch.id)
  const factionMetaById = factionMetaStore((state) => state.byId)
  const summary = useEpochNarration(epochId).summary
  const wars = summary?.highlights.wars ?? []

  return (
    <motion.section
      initial={{ opacity: 0, x: 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.98, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[color:rgba(180,126,68,0.44)] bg-[color:rgba(22,13,6,0.68)] p-3 shadow-[0_0_42px_rgba(80,42,16,0.22)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[color:rgba(255,231,184,0.12)] pb-2 font-hud">
        <h2 className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:rgba(255,231,184,0.9)]">
          关键战争
        </h2>
        <span className="text-[0.56rem] tracking-[0.18em] text-[color:rgba(255,231,184,0.46)]">
          {wars.length}
        </span>
      </div>
      <div className="grid max-h-[28vh] gap-2 overflow-y-auto pr-1 lg:max-h-[34vh]">
        {wars.length > 0 ? (
          wars.map((war) => (
            <article key={war.id} className="border border-[color:rgba(255,231,184,0.12)] bg-[color:rgba(6,4,2,0.42)] p-2">
              <div className="flex items-center justify-between gap-3 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(255,231,184,0.5)]">
                <span>{war.regionId}</span>
                <span className="text-[color:rgba(255,204,102,0.84)]">T{war.turn}</span>
              </div>
              <div className="mt-1 grid gap-1 font-sans text-[0.78rem] leading-5 text-[color:rgba(255,242,218,0.86)]">
                <div>
                  {factionMetaById[war.actor]?.name ?? war.actor} 攻 /{' '}
                  {factionMetaById[war.target]?.name ?? war.target} 守
                </div>
                <div className="text-[color:rgba(255,231,184,0.58)]">
                  伤亡 {war.attackerLoss} / {war.defenderLoss} · 剩余 {war.attackerRemainingTroops} /{' '}
                  {war.defenderRemainingTroops}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="border border-[color:rgba(255,231,184,0.1)] bg-[color:rgba(6,4,2,0.34)] p-4 text-center font-sans text-[0.82rem] text-[color:rgba(255,231,184,0.58)]">
            本纪元未记录成规模战争。
          </div>
        )}
      </div>
    </motion.section>
  )
}
