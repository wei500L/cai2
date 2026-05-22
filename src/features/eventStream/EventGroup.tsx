import clsx from 'clsx'
import type { GameEvent } from '@/mock/types'
import { EventItem } from './EventItem'

type EventGroupProps = {
  groupKey: string
  label: string
  events: GameEvent[]
  collapsed: boolean
  isCurrent: boolean
  selectedEventId: string | null
  getRelativeTime: (createdAt: number) => string
  onToggle: (groupKey: string) => void
  onFocusEvent: (event: GameEvent) => void
}

export function EventGroup({
  groupKey,
  label,
  events,
  collapsed,
  isCurrent,
  selectedEventId,
  getRelativeTime,
  onToggle,
  onFocusEvent,
}: EventGroupProps) {
  const p0Count = events.filter((event) => event.priority === 'P0').length

  return (
    <section className="border-l border-[color:rgba(51,170,255,0.16)] pl-2">
      <button
        type="button"
        className={clsx(
          'mb-2 flex min-h-8 w-full items-center gap-2 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(0,0,0,0.46)] px-2 text-left font-hud text-[0.58rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.68)] transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--border-glow)]',
          isCurrent && 'border-[color:rgba(51,170,255,0.34)] text-[color:var(--text-primary)]',
        )}
        onClick={() => onToggle(groupKey)}
        aria-expanded={!collapsed}
      >
        <span className="text-[0.7rem] leading-none">{collapsed ? '+' : '-'}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isCurrent ? (
          <span className="border border-[color:rgba(51,170,255,0.28)] px-1 py-0.5 text-[0.48rem] text-[color:rgba(158,215,255,0.82)]">
            当前
          </span>
        ) : null}
        {p0Count > 0 ? (
          <span className="border border-[color:rgba(255,102,102,0.5)] px-1 py-0.5 text-[0.48rem] text-[color:#ffb1b1]">
            P0 {p0Count}
          </span>
        ) : null}
        <span className="text-[color:rgba(196,228,255,0.42)]">{events.length}</span>
      </button>

      {!collapsed ? (
        <div className="grid gap-2">
          {events.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              selected={selectedEventId === event.id}
              relativeTime={getRelativeTime(event.createdAt)}
              onFocus={onFocusEvent}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
