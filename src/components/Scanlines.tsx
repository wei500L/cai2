import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

type ScanlinesProps = HTMLAttributes<HTMLDivElement>

export function Scanlines({ className, style, ...props }: ScanlinesProps) {
  return (
    <div
      {...props}
      aria-hidden
      className={clsx(
        'pointer-events-none absolute inset-0 z-10 overflow-hidden mix-blend-screen',
        className,
      )}
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(255,255,255,var(--scanline-opacity)) 0, rgba(255,255,255,var(--scanline-opacity)) 1px, transparent 1px, transparent 4px)',
        backgroundSize: '100% 4px',
        opacity: 1,
        ...style,
      }}
    />
  )
}
