import type { CommandMode, ToneAnalysis } from './types'

type ToneMeterProps = {
  tone: ToneAnalysis
  mode: CommandMode
}

const toneLabels: Record<ToneAnalysis['label'], string> = {
  calm: '克制',
  cooperative: '合作',
  deceptive: '欺瞒',
  aggressive: '强硬',
}

export function ToneMeter({ tone, mode }: ToneMeterProps) {
  const privateSignal = mode === 'private'

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between font-hud text-[0.54rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.48)]">
        <span>{privateSignal ? '欺瞒 / 信任扫描' : '语气检测'}</span>
        <span className="text-[color:var(--text-primary)]">{toneLabels[tone.label]}</span>
      </div>
      <div className="relative h-3 border border-[color:rgba(255,255,255,0.14)] bg-[color:rgba(0,0,0,0.36)] p-[2px]">
        <div
          aria-hidden
          className="h-full"
          style={{
            background:
              'linear-gradient(90deg, #33aaff 0%, #ffdd66 42%, #ff9933 68%, #ff4d4d 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute top-[-3px] h-[17px] w-[3px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-[left] duration-150"
          style={{ left: `calc(${tone.heat}% - 2px)` }}
        />
      </div>
      {privateSignal ? (
        <div className="grid grid-cols-2 gap-2 font-hud text-[0.52rem] uppercase tracking-[0.14em] text-[color:rgba(196,228,255,0.54)]">
          <span>欺瞒 {Math.round(tone.deception)}</span>
          <span className="text-right">信任 {Math.round(tone.trust)}</span>
        </div>
      ) : null}
    </div>
  )
}
