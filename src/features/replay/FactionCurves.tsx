import type { CSSProperties } from 'react'
import { factionTokens } from '@/components/hudTheme'
import { selectReplayFactionCurves, useReplay } from '@/store/replayStore'
import type { ReplayData } from '@/types/replay'
import { getFactionName } from './replayViewUtils'

const width = 520
const height = 210
const padding = 24

function buildPath(points: ReplayData['factionCurves'][number]['points'], minPower: number, maxPower: number) {
  const span = Math.max(1, maxPower - minPower)
  return points
    .map((point, index) => {
      const x =
        points.length <= 1
          ? width / 2
          : padding + (index / (points.length - 1)) * (width - padding * 2)
      const y = height - padding - ((point.totalPower - minPower) / span) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function FactionCurves() {
  const curves = useReplay(selectReplayFactionCurves)
  const powers = curves.flatMap((curve) => curve.points.map((point) => point.totalPower))
  const minPower = Math.min(...powers, 80)
  const maxPower = Math.max(...powers, 420)

  return (
    <section className="border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.78)] p-3">
      <div className="mb-3">
        <div className="font-hud text-sm text-[color:var(--text-warn)]">势力兴衰曲线</div>
        <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">8 势力总国力占位回放</div>
      </div>
      <div className="overflow-hidden border border-[color:rgba(196,228,255,0.1)] bg-black/30">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label="势力兴衰曲线">
          <defs>
            <linearGradient id="replayCurveGrid" x1="0" x2="1">
              <stop offset="0%" stopColor="rgba(255,204,102,0.18)" />
              <stop offset="100%" stopColor="rgba(153,51,255,0.16)" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((line) => {
            const y = padding + line * ((height - padding * 2) / 3)
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
              />
            )
          })}
          <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="url(#replayCurveGrid)" />
          {curves.map((curve) => (
            <path
              key={curve.factionId}
              d={buildPath(curve.points, minPower, maxPower)}
              fill="none"
              stroke={factionTokens[curve.factionId].primary}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 5px ${factionTokens[curve.factionId].glow})` } as CSSProperties}
            />
          ))}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {curves.map((curve) => (
          <div key={curve.factionId} className="flex min-w-0 items-center gap-2 text-[0.68rem]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: factionTokens[curve.factionId].primary, boxShadow: `0 0 10px ${factionTokens[curve.factionId].glow}` }}
            />
            <span className="truncate text-[color:rgba(244,251,255,0.72)]">{getFactionName(curve.factionId)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
