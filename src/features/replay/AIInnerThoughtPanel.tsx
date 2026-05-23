import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { factionTokens } from '@/components/hudTheme'
import type { FactionId } from '@/types/faction'
import type { AIInnerThought, ReplayTimelineNode } from '@/types/replay'
import type { DiaryEntry } from '@/protocol/types'
import { useGameStore } from '@/store/gameStore'
import { formatReplayTime, getFactionName } from './replayViewUtils'

type AIInnerThoughtPanelProps = {
  thoughts: AIInnerThought[]
  replayTime: ReplayTimelineNode
  currentFocusFaction?: FactionId
}

export function AIInnerThoughtPanel({
  thoughts,
  replayTime,
  currentFocusFaction,
}: AIInnerThoughtPanelProps) {
  const aiDiaries = useGameStore((state) => state.aiDiaries)
  const hasDiariesRevealed = useGameStore((state) => state.hasDiariesRevealed())
  const currentThoughts = useMemo(
    () =>
      selectReplayThoughts({
        thoughts,
        aiDiaries,
        hasDiariesRevealed,
        replayTime,
        currentFocusFaction,
      }),
    [aiDiaries, currentFocusFaction, hasDiariesRevealed, replayTime, thoughts],
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const displayIndex = activeIndex % Math.max(1, currentThoughts.length)
  const activeThought = currentThoughts[displayIndex]

  useEffect(() => {
    if (currentThoughts.length <= 1) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % currentThoughts.length)
    }, 5200)

    return () => window.clearInterval(timer)
  }, [currentThoughts.length])

  return (
    <section className="relative overflow-hidden border border-[color:rgba(153,51,255,0.28)] bg-[linear-gradient(180deg,rgba(23,10,42,0.92),rgba(8,4,18,0.96))] px-4 py-3">
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_24%,rgba(255,255,255,0.65)_0_1px,transparent_1.6px),radial-gradient(circle_at_78%_42%,rgba(196,228,255,0.5)_0_1px,transparent_1.7px),radial-gradient(circle_at_48%_72%,rgba(153,51,255,0.55)_0_1px,transparent_1.8px)] [background-size:120px_90px,180px_130px,150px_110px]" />
      <div className="relative z-10 mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="font-hud text-sm text-[color:rgba(220,196,255,0.96)]">AI 内心独白</div>
          <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.5)]">
            {formatReplayTime(replayTime.epoch, replayTime.turn)} / 上帝视角解密
          </div>
        </div>
        <div className="font-hud text-[0.62rem] text-[color:rgba(220,196,255,0.62)]">
          {currentThoughts.length ? `${displayIndex + 1}/${currentThoughts.length}` : '0/0'}
        </div>
      </div>
      <div className="relative z-10 min-h-24">
        <AnimatePresence mode="wait">
          {activeThought ? (
            <motion.div
              key={`${activeThought.factionId}:${activeThought.epoch}:${activeThought.turn}:${activeIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={
                {
                  '--thought-glow': factionTokens[activeThought.factionId].glow,
                } as CSSProperties
              }
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[color:var(--thought-glow)] shadow-[0_0_16px_var(--thought-glow)]" />
                <span className="font-hud text-xs text-[color:var(--thought-glow)]">
                  {getFactionName(activeThought.factionId)}
                </span>
              </div>
              <TypewriterText key={activeThought.text} text={activeThought.text} />
            </motion.div>
          ) : (
            <motion.div
              key="empty-thought"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-[color:rgba(212,227,235,0.56)]"
            >
              当前节点没有 AI 独白记录。
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function TypewriterText({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState('')

  useEffect(() => {
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setVisibleText(text.slice(0, index))
      if (index >= text.length) {
        window.clearInterval(timer)
      }
    }, 22)

    return () => window.clearInterval(timer)
  }, [text])

  return (
    <p className="max-h-24 overflow-y-auto pr-2 text-sm leading-6 text-[color:rgba(248,242,255,0.86)]">
      {visibleText}
      <span className="ml-1 text-[color:var(--thought-glow)]">_</span>
    </p>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function selectReplayThoughts({
  thoughts,
  aiDiaries,
  hasDiariesRevealed,
  replayTime,
  currentFocusFaction,
}: {
  thoughts: AIInnerThought[]
  aiDiaries: Record<FactionId, DiaryEntry[]>
  hasDiariesRevealed: boolean
  replayTime: ReplayTimelineNode
  currentFocusFaction?: FactionId
}): AIInnerThought[] {
  const nodeMatches = (epoch: number, turn: number) =>
    epoch === replayTime.epoch && turn === replayTime.turn

  if (currentFocusFaction) {
    if (hasDiariesRevealed && aiDiaries[currentFocusFaction]?.length) {
      const diaryThoughts = aiDiaries[currentFocusFaction]
        .filter((entry) => nodeMatches(entry.epoch, entry.turn))
        .map((entry) => ({
          factionId: currentFocusFaction,
          epoch: entry.epoch,
          turn: entry.turn,
          text: entry.internal_thought,
        }))

      if (diaryThoughts.length > 0) {
        return diaryThoughts
      }
    }

    return thoughts.filter(
      (thought) =>
        thought.factionId === currentFocusFaction &&
        thought.epoch === replayTime.epoch &&
        thought.turn === replayTime.turn,
    )
  }

  return thoughts.filter((thought) => nodeMatches(thought.epoch, thought.turn))
}
