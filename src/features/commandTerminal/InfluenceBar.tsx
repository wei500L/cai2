import type { CommandMode, InfluenceLevel, ToneAnalysis } from './types'

type InfluenceBarProps = {
  content: string
  mode: CommandMode
  tone: ToneAnalysis
}

const levelLabels: Record<InfluenceLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

const modeBoost: Record<CommandMode, number> = {
  speech: 18,
  private: 10,
  treaty: 15,
  military: 12,
  intel: 9,
}

function estimateInfluence(content: string, mode: CommandMode, tone: ToneAnalysis) {
  const lengthScore = Math.min(45, Math.floor(content.trim().length / 5))
  const keywordScore = tone.matched.length * 5 + Math.floor(tone.cooperation / 8) + Math.floor(tone.hostility / 12)
  const score = Math.min(100, modeBoost[mode] + lengthScore + keywordScore)
  const level: InfluenceLevel = score >= 66 ? 'high' : score >= 34 ? 'medium' : 'low'

  return { score, level }
}

export function InfluenceBar({ content, mode, tone }: InfluenceBarProps) {
  const influence = estimateInfluence(content, mode, tone)

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between font-hud text-[0.54rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.48)]">
        <span>影响力预估</span>
        <span className="text-[color:var(--text-primary)]">{levelLabels[influence.level]}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['low', 'medium', 'high'] as const).map((level, index) => {
          const filled = index <= ['low', 'medium', 'high'].indexOf(influence.level)

          return (
            <div
              key={level}
              className="h-3 border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(0,0,0,0.34)] p-[2px]"
            >
              <div
                className="h-full transition-opacity duration-150"
                style={{
                  opacity: filled ? 1 : 0.16,
                  background:
                    level === 'high'
                      ? 'linear-gradient(90deg, rgba(255,102,102,0.7), rgba(255,210,90,0.88))'
                      : 'linear-gradient(90deg, rgba(51,170,255,0.45), rgba(51,255,255,0.78))',
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
