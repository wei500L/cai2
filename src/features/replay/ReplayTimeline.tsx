import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { factionTokens } from '@/components/hudTheme'
import type { ReplayData } from '@/mock/replay'
import { createEventLookup, formatReplayTime, getEventFaction, getMarkerLabel } from './replayViewUtils'

type ReplayTimelineProps = {
  replay: ReplayData
  currentIndex: number
  onSelect: (index: number) => void
}

export function ReplayTimeline({ replay, currentIndex, onSelect }: ReplayTimelineProps) {
  const events = createEventLookup(replay.events)
  const max = Math.max(0, replay.timeline.length - 1)

  return (
    <div className="relative border-t border-[color:rgba(255,204,102,0.22)] bg-[linear-gradient(180deg,rgba(24,13,6,0.9),rgba(7,4,3,0.96))] px-4 pb-4 pt-3">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-hud text-[color:var(--text-warn)]">解密时间轴</div>
          <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">
            拖动底轨或点击节点回看关键转折
          </div>
        </div>
        <div className="font-hud text-[color:rgba(255,245,220,0.72)]">
          {replay.timeline[currentIndex]
            ? formatReplayTime(
                replay.timeline[currentIndex].epoch,
                replay.timeline[currentIndex].turn,
                replay.timeline[currentIndex].phase,
              )
            : 'NO SIGNAL'}
        </div>
      </div>
      <div className="relative h-20">
        <div className="absolute left-0 right-0 top-9 h-[2px] bg-[linear-gradient(90deg,rgba(255,204,102,0.18),rgba(153,51,255,0.34),rgba(255,204,102,0.18))]" />
        <input
          aria-label="复盘时间轴"
          type="range"
          min={0}
          max={max}
          value={currentIndex}
          onChange={(event) => onSelect(Number(event.currentTarget.value))}
          className="absolute left-0 right-0 top-6 z-20 h-8 w-full cursor-pointer opacity-0"
        />
        {replay.timeline.map((node, index) => {
          const event = events.get(node.keyEventIds[0])
          const factionId = getEventFaction(event)
          const left = max === 0 ? 0 : (index / max) * 100
          const active = index === currentIndex

          return (
            <button
              key={`${node.epoch}:${node.turn}:${node.phase}:${index}`}
              type="button"
              onClick={() => onSelect(index)}
              className="absolute top-1 z-30 flex w-20 -translate-x-1/2 flex-col items-center gap-1 text-center first:translate-x-0 last:-translate-x-full"
              style={
                {
                  left: `${left}%`,
                  '--node-glow': factionTokens[factionId].glow,
                  '--node-primary': factionTokens[factionId].primary,
                } as CSSProperties
              }
            >
              <span className="relative flex h-10 w-10 items-center justify-center">
                <motion.span
                  aria-hidden
                  className="absolute h-8 w-8 rounded-full border border-[color:var(--node-glow)]"
                  animate={{ opacity: active ? [0.25, 0.92, 0.25] : [0.12, 0.42, 0.12], scale: [0.82, 1.32, 0.82] }}
                  transition={{ duration: active ? 1.1 : 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ boxShadow: '0 0 20px var(--node-glow)' }}
                />
                <span className="relative h-3 w-3 rounded-full bg-[color:var(--node-primary)] shadow-[0_0_14px_var(--node-glow)]" />
              </span>
              <span className="max-w-20 truncate font-hud text-[0.62rem] text-[color:rgba(255,245,220,0.8)]">
                {getMarkerLabel(event)}
              </span>
              <span className="font-hud text-[0.55rem] text-[color:rgba(212,227,235,0.46)]">
                E{node.epoch} T{node.turn}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
