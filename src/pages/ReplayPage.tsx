import { useEffect, useMemo, useState } from 'react'
import { Scanlines } from '@/components/Scanlines'
import { factionTokens } from '@/components/hudTheme'
import { AIInnerThoughtPanel } from '@/features/replay/AIInnerThoughtPanel'
import { FactionCurves } from '@/features/replay/FactionCurves'
import { KeyMoments } from '@/features/replay/KeyMoments'
import { PrivateMessageLog } from '@/features/replay/PrivateMessageLog'
import { RelationshipNetwork } from '@/features/replay/RelationshipNetwork'
import { ReplayControls } from '@/features/replay/ReplayControls'
import { ReplayStage } from '@/features/replay/ReplayStage'
import { ReplayTimeline } from '@/features/replay/ReplayTimeline'
import { ShareBar } from '@/features/replay/ShareBar'
import { getFactionName } from '@/features/replay/replayViewUtils'
import { buildReplay } from '@/mock/replay'
import { replayFixture } from '@/mock/replayFixtures'
import { useGameStore } from '@/store/gameStore'

function hasAccumulatedGameData(state: ReturnType<typeof useGameStore.getState>) {
  return (
    state.selectedFactionId !== null ||
    state.privateMessages.length > 0 ||
    state.epoch.id > 1 ||
    state.events.some((event) => !event.id.startsWith('initial_event_'))
  )
}

export default function ReplayPage() {
  const gameState = useGameStore((state) => state)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [toast, setToast] = useState<string | null>(null)

  const { replay, dataSource } = useMemo(() => {
    if (hasAccumulatedGameData(gameState)) {
      return { replay: buildReplay(gameState), dataSource: 'gameStore' as const }
    }

    return { replay: replayFixture, dataSource: 'fixtures' as const }
  }, [gameState])

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, replay.timeline.length - 1))
  const replayTime = replay.timeline[safeCurrentIndex] ?? replay.timeline[0]

  useEffect(() => {
    if (!isPlaying || replay.timeline.length <= 1) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= replay.timeline.length - 1) {
          setIsPlaying(false)
          return index
        }

        return index + 1
      })
    }, 1600 / speed)

    return () => window.clearInterval(timer)
  }, [isPlaying, replay.timeline.length, speed])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showMockToast = () => {
    setToast('已复制 (mock)')
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(128,78,32,0.32),transparent_36%),linear-gradient(180deg,#120b07_0%,#050406_54%,#030205_100%)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,204,102,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,204,102,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,204,102,0.12),transparent_22%),radial-gradient(circle_at_84%_18%,rgba(153,51,255,0.12),transparent_24%)]" />
      <Scanlines />
      <div className="relative z-10 flex min-h-screen flex-col gap-3 p-3 lg:p-4">
        <header className="flex flex-wrap items-start justify-between gap-3 border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.72)] px-4 py-3">
          <div>
            <div className="font-hud text-[0.62rem] uppercase text-[color:rgba(255,204,102,0.56)]">
              GOD VIEW / DECLASSIFIED REPLAY
            </div>
            <h1 className="mt-1 text-xl font-bold text-[color:rgba(255,250,235,0.96)]">外交风云 · 赛后复盘</h1>
            <div className="mt-1 text-xs text-[color:rgba(212,227,235,0.58)]">
              数据源：{dataSource === 'gameStore' ? 'gameStore 累积事件' : 'replayFixtures 完整样例'} / {replay.events.length} 条事件 / {replay.privateMessages.length} 条密谈
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReplayControls
              isPlaying={isPlaying}
              speed={speed}
              onTogglePlay={() => setIsPlaying((value) => !value)}
              onSpeedChange={setSpeed}
            />
            <ShareBar toast={toast} onMockShare={showMockToast} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(26rem,1fr)_auto]">
            {replayTime ? <ReplayStage replay={replay} replayTime={replayTime} /> : null}
            {replayTime ? <AIInnerThoughtPanel thoughts={replay.aiInnerThoughts} replayTime={replayTime} /> : null}
          </div>
          <PrivateMessageLog messages={replay.privateMessages} />
        </div>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)_minmax(18rem,0.75fr)]">
          <FactionCurves curves={replay.factionCurves} />
          {replayTime ? (
            <RelationshipNetwork snapshots={replay.relationshipSnapshots} replayTime={replayTime} />
          ) : null}
          <div className="border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.78)] p-3">
            <div className="mb-3">
              <div className="font-hud text-sm text-[color:var(--text-warn)]">欺骗统计</div>
              <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">谎言、暴露与成功率占位</div>
            </div>
            <div className="space-y-2">
              {replay.deceptionStats.map((stat) => (
                <div key={stat.factionId} className="border border-[color:rgba(196,228,255,0.1)] bg-black/24 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-[color:rgba(244,251,255,0.78)]">{getFactionName(stat.factionId)}</span>
                    <span className="font-hud" style={{ color: factionTokens[stat.factionId].glow }}>
                      {stat.successRate}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden bg-white/10">
                    <div
                      className="h-full"
                      style={{
                        width: `${stat.successRate}%`,
                        background: factionTokens[stat.factionId].primary,
                        boxShadow: `0 0 12px ${factionTokens[stat.factionId].glow}`,
                      }}
                    />
                  </div>
                  <div className="mt-1 font-hud text-[0.58rem] text-[color:rgba(212,227,235,0.48)]">
                    lies {stat.lies} / exposed {stat.exposed}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <KeyMoments moments={replay.keyMoments} />
        <ReplayTimeline replay={replay} currentIndex={safeCurrentIndex} onSelect={setCurrentIndex} />
      </div>
    </main>
  )
}
