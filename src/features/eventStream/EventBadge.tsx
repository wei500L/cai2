import clsx from 'clsx'
import type { EventPriority } from '@/mock/types'

type EventBadgeProps = {
  priority: EventPriority
}

const badgeStyles: Record<EventPriority, string> = {
  P0: 'border-[color:rgba(255,102,102,0.92)] bg-[color:rgba(70,8,12,0.9)] text-[color:#ffd2d2] shadow-[0_0_18px_rgba(255,65,65,0.42)]',
  P1: 'border-[color:var(--event-faction-glow)] bg-[color:rgba(8,18,26,0.9)] text-[color:var(--event-faction-glow)] shadow-[0_0_14px_var(--event-faction-shadow)]',
  P2: 'border-[color:rgba(210,220,230,0.34)] bg-[color:rgba(255,255,255,0.025)] text-[color:rgba(218,230,238,0.74)]',
}

export function EventBadge({ priority }: EventBadgeProps) {
  return (
    <span
      className={clsx(
        'absolute left-0 top-0 z-10 border-b border-r px-1.5 py-0.5 font-hud text-[0.52rem] font-bold leading-none tracking-[0.16em]',
        badgeStyles[priority],
      )}
    >
      {priority}
    </span>
  )
}
