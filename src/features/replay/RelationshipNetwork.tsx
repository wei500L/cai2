import type { CSSProperties } from 'react'
import { factionIds, factionTokens } from '@/components/hudTheme'
import type { RelationshipSnapshot, ReplayTimelineNode } from '@/mock/replay'
import { getFactionName, relationshipColors, relationshipLabels } from './replayViewUtils'

type RelationshipNetworkProps = {
  snapshots: RelationshipSnapshot[]
  replayTime: ReplayTimelineNode
}

const size = 280
const center = size / 2
const radius = 96

function getSnapshot(snapshots: RelationshipSnapshot[], epoch: number) {
  return (
    [...snapshots].reverse().find((snapshot) => snapshot.epoch <= epoch) ??
    snapshots[0]
  )
}

export function RelationshipNetwork({ snapshots, replayTime }: RelationshipNetworkProps) {
  const snapshot = getSnapshot(snapshots, replayTime.epoch)
  const positions = factionIds.map((factionId, index) => {
    const angle = -Math.PI / 2 + (index / factionIds.length) * Math.PI * 2
    return {
      factionId,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    }
  })

  return (
    <section className="border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.78)] p-3">
      <div className="mb-3">
        <div className="font-hud text-sm text-[color:var(--text-warn)]">关系网络快照</div>
        <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">纪元 {snapshot?.epoch ?? replayTime.epoch} 末关系矩阵</div>
      </div>
      <div className="flex justify-center overflow-hidden border border-[color:rgba(196,228,255,0.1)] bg-black/30">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-72 w-full max-w-sm" role="img" aria-label="关系网络">
          <circle cx={center} cy={center} r={radius + 18} fill="none" stroke="rgba(255,204,102,0.1)" />
          {positions.flatMap((from, fromIndex) =>
            positions.slice(fromIndex + 1).map((to) => {
              const status = snapshot?.matrix[from.factionId][to.factionId] ?? 'neutral'
              return (
                <line
                  key={`${from.factionId}:${to.factionId}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={relationshipColors[status]}
                  strokeWidth={status === 'allied' || status === 'hostile' ? 1.8 : 0.8}
                  strokeDasharray={status === 'wary' ? '4 4' : undefined}
                >
                  <title>{relationshipLabels[status]}</title>
                </line>
              )
            }),
          )}
          {positions.map((node) => (
            <g
              key={node.factionId}
              style={
                {
                  '--node-primary': factionTokens[node.factionId].primary,
                  '--node-glow': factionTokens[node.factionId].glow,
                } as CSSProperties
              }
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="11"
                fill="var(--node-primary)"
                stroke="var(--node-glow)"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 0 7px var(--node-glow))' }}
              />
              <text
                x={node.x}
                y={node.y + 24}
                textAnchor="middle"
                fill="rgba(244,251,255,0.72)"
                fontSize="9"
              >
                {getFactionName(node.factionId).slice(0, 2)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}
