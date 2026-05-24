import type { CSSProperties } from 'react'
import { factionTokens } from '@/components/hudTheme'
import { selectReplayKeyMoments, useReplay } from '@/store/replayStore'
import { formatReplayTime, getFactionName } from './replayViewUtils'

export function KeyMoments() {
  const moments = useReplay(selectReplayKeyMoments)

  return (
    <section className="border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.78)] p-3">
      <div className="mb-3">
        <div className="font-hud text-sm text-[color:var(--text-warn)]">名场面截图</div>
        <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">P0 事件截图占位</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {moments.map((moment) => {
          const factionId = moment.factionId ?? 'starlight'
          return (
            <article
              key={moment.id}
              className="overflow-hidden border bg-black/30"
              style={
                {
                  borderColor: factionTokens[factionId].glow,
                  '--moment-glow': factionTokens[factionId].glow,
                } as CSSProperties
              }
            >
              <div className="relative flex aspect-video items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(255,204,102,0.18),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.42))]">
                <div className="absolute inset-3 border border-[color:rgba(255,255,255,0.12)]" />
                <div className="font-hud text-xs text-[color:rgba(255,245,220,0.72)]">P0 SNAPSHOT / MOCK</div>
              </div>
              <div className="p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-hud text-xs text-[color:var(--moment-glow)]">{moment.title}</div>
                  <div className="font-hud text-[0.58rem] text-[color:rgba(212,227,235,0.48)]">
                    {formatReplayTime(moment.epoch, moment.turn)}
                  </div>
                </div>
                <div className="mb-1 text-[0.68rem] text-[color:rgba(255,245,220,0.58)]">
                  {getFactionName(factionId)}
                </div>
                <p className="line-clamp-3 text-xs leading-5 text-[color:rgba(244,251,255,0.72)]">
                  {moment.caption}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
