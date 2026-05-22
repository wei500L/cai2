import type { HTMLAttributes } from 'react'
import clsx from 'clsx'
import { relationLabels, relationTokens, type RelationState } from './hudTheme'

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  state?: RelationState
}

export function StatusBadge({
  state = 'neutral',
  className,
  children,
  style,
  ...props
}: StatusBadgeProps) {
  const tokens = relationTokens[state]

  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center border px-2.5 py-1 font-hud text-[0.78rem] font-medium uppercase tracking-[0.06em] leading-none',
        className,
      )}
      style={{
        borderColor: tokens.border,
        color: tokens.text,
        background: tokens.fill,
        boxShadow: `0 0 0 1px ${tokens.border}, 0 0 10px ${tokens.glow}`,
        ...style,
      }}
    >
      {children ?? relationLabels[state]}
    </span>
  )
}
