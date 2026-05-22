import type { ReactNode } from 'react'
import clsx from 'clsx'
import { GlowPanel } from './GlowPanel'

type EmptyStateProps = {
  title: string
  detail?: string
  cta?: ReactNode
  className?: string
}

export function EmptyState({ title, detail, cta, className }: EmptyStateProps) {
  return (
    <GlowPanel tone="neutral" className={clsx('grid min-h-36 place-items-center rounded-none', className)}>
      <div className="relative w-full px-4 py-6 text-center font-hud">
        <div
          aria-hidden
          className="absolute inset-0 opacity-55"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(51,170,255,0.08) 0, rgba(51,170,255,0.08) 1px, transparent 1px, transparent 6px)',
          }}
        />
        <div className="relative text-[0.68rem] uppercase tracking-[0.24em] text-[color:var(--text-primary)]">
          {title}
        </div>
        {detail ? (
          <div className="relative mt-2 text-[0.56rem] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            {detail}
          </div>
        ) : null}
        {cta ? <div className="relative mt-4 flex justify-center">{cta}</div> : null}
      </div>
    </GlowPanel>
  )
}
