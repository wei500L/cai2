import clsx from 'clsx'

type LoadingHologramProps = {
  label?: string
  className?: string
}

export function LoadingHologram({ label = '同步全息数据', className }: LoadingHologramProps) {
  return (
    <div className={clsx('grid min-h-36 place-items-center font-hud', className)}>
      <div className="relative grid h-28 w-28 place-items-center">
        <div className="absolute inset-0 border border-[color:var(--border-glow)] opacity-50 animate-[spin_2.4s_linear_infinite]" />
        <div className="absolute inset-4 border border-[color:rgba(255,255,255,0.22)] animate-[spin_1.8s_linear_infinite_reverse]" />
        <div className="h-3 w-3 bg-[color:var(--border-glow)] shadow-[0_0_18px_var(--border-glow)]" />
      </div>
      <div className="mt-3 animate-flicker text-[0.58rem] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
        {label}
      </div>
    </div>
  )
}
