import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { GlowPanel } from '@/components/GlowPanel'
import { factionTokens } from '@/components/hudTheme'
import type { ReplayTimelineNode } from '@/types/replay'
import { useReplay } from '@/store/replayStore'
import { createEventLookup, formatReplayTime, getEventFaction, getFactionName, getMarkerLabel } from './replayViewUtils'

type ReplayStageProps = {
  replayTime: ReplayTimelineNode
}

export function ReplayStage({ replayTime }: ReplayStageProps) {
  const replay = useReplay((state) => state.data)
  if (!replay) {
    return null
  }

  const events = createEventLookup(replay.events)
  const focusEvent = replayTime.keyEventIds.map((id) => events.get(id)).find(Boolean)
  const focusFaction = getEventFaction(focusEvent)
  const targetFaction = focusEvent?.target

  return (
    <GlowPanel
      tone="faction"
      factionId={focusFaction}
      className="h-full min-h-[26rem] rounded-none border-[color:rgba(255,204,102,0.32)] bg-[color:rgba(10,7,5,0.76)]"
    >
      <div
        className="relative flex h-full min-h-[26rem] items-center justify-center overflow-hidden"
        style={
          {
            '--focus-glow': factionTokens[focusFaction].glow,
            '--focus-primary': factionTokens[focusFaction].primary,
          } as CSSProperties
        }
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,204,102,0.09),transparent_42%),linear-gradient(135deg,rgba(90,56,24,0.22),rgba(2,4,10,0.82))]" />
        <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,204,102,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,204,102,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <motion.div
          key={`${replayTime.epoch}:${replayTime.turn}:${replayTime.phase}`}
          className="relative z-10 flex h-[72%] w-[78%] items-center justify-center border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(0,0,0,0.18)]"
          initial={{ opacity: 0.42, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.28 }}
          style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.52), 0 0 44px rgba(255,204,102,0.08)' }}
        >
          <div className="absolute inset-[12%] rounded-[50%] border border-[color:rgba(196,228,255,0.08)]" />
          <div className="absolute inset-[22%] rounded-[50%] border border-[color:rgba(255,204,102,0.12)]" />
          <motion.div
            className="absolute h-36 w-36 rounded-full border border-[color:var(--focus-glow)]"
            animate={{ scale: [0.86, 1.16, 0.86], opacity: [0.32, 0.76, 0.32] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ boxShadow: '0 0 54px var(--focus-glow), inset 0 0 24px var(--focus-glow)' }}
          />
          <div className="relative z-10 max-w-xl px-6 text-center">
            <div className="mb-3 font-hud text-xs text-[color:rgba(255,204,102,0.68)]">
              {formatReplayTime(replayTime.epoch, replayTime.turn, replayTime.phase)}
            </div>
            <div className="text-2xl font-bold text-[color:rgba(255,250,235,0.94)]">回放地图 (静态快照)</div>
            <div className="mt-4 font-hud text-sm text-[color:var(--focus-glow)]">
              mapFocus: {getFactionName(focusFaction)}
              {targetFaction ? ` -> ${getFactionName(targetFaction)}` : ''}
            </div>
            <div className="mt-3 text-sm leading-6 text-[color:rgba(212,227,235,0.66)]">
              {focusEvent ? `${getMarkerLabel(focusEvent)} / ${focusEvent.narration}` : '等待揭示下一段外交记录'}
            </div>
          </div>
        </motion.div>
        <div className="pointer-events-none absolute left-3 top-3 z-20 border border-[color:rgba(255,204,102,0.18)] bg-black/55 px-2 py-1 font-hud text-[0.56rem] uppercase text-[color:rgba(255,245,220,0.56)]">
          REPLAY / STATIC SNAPSHOT / GOD VIEW
        </div>
      </div>
    </GlowPanel>
  )
}
