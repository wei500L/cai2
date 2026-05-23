import { useEffect, useMemo, useState } from 'react'
import { ErrorPanel } from '@/components/ErrorPanel'
import { LoadingHologram } from '@/components/LoadingHologram'
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
import { createEventLookup, getEventFaction, getFactionName } from '@/features/replay/replayViewUtils'
import { replayStore, useReplay } from '@/store/replayStore'

function getReplayRoomId() {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search).get('room')
}

function getDataSourceLabel(status: string, roomId: string | null) {
  if (status === 'mock') {
    return 'MOCK MODE / replayFixture'
  }

  return roomId ? `REST 真实复盘 ${roomId}` : 'REST 真实复盘'
}

function LoadingState() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(128,78,32,0.32),transparent_36%),linear-gradient(180deg,#120b07_0%,#050406_54%,#030205_100%)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,204,102,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,204,102,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <Scanlines />
      <LoadingHologram label="读取真实复盘" className="relative z-10 min-h-56 w-[min(28rem,calc(100vw-2rem))]" />
    </main>
  )
}

function ErrorState({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(128,78,32,0.32),transparent_36%),linear-gradient(180deg,#120b07_0%,#050406_54%,#030205_100%)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,204,102,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,204,102,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <Scanlines />
      <div className="relative z-10 w-[min(32rem,calc(100vw-2rem))]">
        <ErrorPanel code={code} message={message} onRetry={onRetry} />
      </div>
    </main>
  )
}

export default function ReplayPage() {
  const [roomId] = useState(getReplayRoomId)
  const [reloadTick, setReloadTick] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [toast, setToast] = useState<string | null>(null)

  const replay = useReplay((state) => state.data)
  const status = useReplay((state) => state.status)
  const errorCode = useReplay((state) => state.errorCode)
  const errorMessage = useReplay((state) => state.errorMessage)
  const lastFetchedAt = useReplay((state) => state.lastFetchedAt)

  useEffect(() => {
    let cancelled = false

    replayStore.getState().reset()

    if (!roomId) {
      replayStore.setState({
        roomId: null,
        status: 'error',
        data: null,
        errorCode: 'NOT_FOUND',
        errorMessage: '缺少 room 参数。',
        lastFetchedAt: null,
      })

      return () => {
        cancelled = true
      }
    }

    const controller = new AbortController()

    const runLoad = async () => {
      for (let attempt = 1; attempt <= 3 && !cancelled; attempt += 1) {
        const result = await replayStore.getState().load(roomId, controller.signal)
        if (cancelled || result.ok || attempt === 3) {
          return
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 240)
        })
      }
    }

    void runLoad()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [roomId, reloadTick])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentIndex(0)
      setIsPlaying(false)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [lastFetchedAt])

  useEffect(() => {
    if (!isPlaying || !replay || replay.timeline.length <= 1) {
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
  }, [isPlaying, replay, speed])

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

  const retryLoad = () => {
    setReloadTick((value) => value + 1)
  }

  const replayTime = useMemo(() => {
    if (!replay || replay.timeline.length === 0) {
      return undefined
    }

    const safeIndex = Math.min(currentIndex, replay.timeline.length - 1)
    return replay.timeline[safeIndex]
  }, [currentIndex, replay])

  const events = useMemo(() => createEventLookup(replay?.events ?? []), [replay])
  const focusEvent = replayTime ? replayTime.keyEventIds.map((id) => events.get(id)).find(Boolean) : undefined
  const currentFocusFaction = focusEvent ? getEventFaction(focusEvent) : undefined

  if (status === 'error') {
    return (
      <ErrorState
        code={errorCode ? `REPLAY_${errorCode}` : 'REPLAY_FETCH_FAILED'}
        message={errorMessage ?? '真实复盘读取失败。'}
        onRetry={retryLoad}
      />
    )
  }

  if (status !== 'success' && status !== 'mock') {
    return <LoadingState />
  }

  if (!replay || !replayTime) {
    return <LoadingState />
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(128,78,32,0.32),transparent_36%),linear-gradient(180deg,#120b07_0%,#050406_54%,#030205_100%)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,204,102,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(255,204,102,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,204,102,0.12),transparent_22%),radial-gradient(circle_at_84%_18%,rgba(153,51,255,0.12),transparent_24%)]" />
      <Scanlines />
      {status === 'mock' ? (
        <div className="relative z-20 border-b border-[color:rgba(153,51,255,0.32)] bg-[color:rgba(153,51,255,0.16)] px-4 py-2 font-hud text-[0.62rem] uppercase text-[color:rgba(240,224,255,0.88)]">
          MOCK MODE / replayFixture
        </div>
      ) : null}
      <div className="relative z-10 flex min-h-screen flex-col gap-3 p-3 lg:p-4">
        <header className="flex flex-wrap items-start justify-between gap-3 border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.72)] px-4 py-3">
          <div>
            <div className="font-hud text-[0.62rem] uppercase text-[color:rgba(255,204,102,0.56)]">
              GOD VIEW / DECLASSIFIED REPLAY
            </div>
            <h1 className="mt-1 text-xl font-bold text-[color:rgba(255,250,235,0.96)]">外交风云 · 赛后复盘</h1>
            <div className="mt-1 text-xs text-[color:rgba(212,227,235,0.58)]">
              数据源：{getDataSourceLabel(status, roomId)} / {replay.events.length} 条事件 / {replay.privateMessages.length} 条密谈
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
            <ReplayStage replayTime={replayTime} />
            <AIInnerThoughtPanel replayTime={replayTime} currentFocusFaction={currentFocusFaction} />
          </div>
          <PrivateMessageLog messages={replay.privateMessages} />
        </div>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)_minmax(18rem,0.75fr)]">
          <FactionCurves />
          <RelationshipNetwork snapshots={replay.relationshipSnapshots} replayTime={replayTime} />
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

        <KeyMoments />
        <ReplayTimeline replay={replay} currentIndex={Math.min(currentIndex, replay.timeline.length - 1)} onSelect={setCurrentIndex} />
      </div>
    </main>
  )
}
