import clsx from 'clsx'

type ReplayControlsProps = {
  isPlaying: boolean
  speed: number
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
}

const speeds = [1, 2, 4]

export function ReplayControls({
  isPlaying,
  speed,
  onTogglePlay,
  onSpeedChange,
}: ReplayControlsProps) {
  return (
    <div className="flex items-center gap-2 border border-[color:rgba(255,204,102,0.2)] bg-[color:rgba(20,12,6,0.76)] px-2 py-1">
      <button
        type="button"
        onClick={onTogglePlay}
        className="h-8 min-w-16 border border-[color:rgba(255,204,102,0.42)] bg-[color:rgba(255,204,102,0.08)] px-3 font-hud text-xs text-[color:var(--text-warn)] transition hover:bg-[color:rgba(255,204,102,0.16)]"
      >
        {isPlaying ? '暂停' : '播放'}
      </button>
      <div className="flex overflow-hidden border border-[color:rgba(196,228,255,0.14)]">
        {speeds.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onSpeedChange(item)}
            className={clsx(
              'h-8 w-10 border-r border-[color:rgba(196,228,255,0.12)] font-hud text-[0.68rem] last:border-r-0',
              speed === item
                ? 'bg-[color:rgba(153,51,255,0.26)] text-white'
                : 'bg-black/30 text-[color:rgba(212,227,235,0.62)] hover:bg-white/5',
            )}
          >
            {item}x
          </button>
        ))}
      </div>
    </div>
  )
}
