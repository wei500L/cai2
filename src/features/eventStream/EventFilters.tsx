import clsx from 'clsx'
import type { EventFilter } from '@/store/uiStore'
import { useUIStore } from '@/store/uiStore'

const filters: { id: EventFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'P0', label: 'P0' },
  { id: 'P1', label: 'P1' },
  { id: 'mine', label: '我相关' },
]

export function EventFilters() {
  const eventFilter = useUIStore((state) => state.eventFilter)
  const setEventFilter = useUIStore((state) => state.setEventFilter)

  return (
    <div className="grid grid-cols-4 border border-[color:rgba(255,255,255,0.1)] bg-[color:rgba(0,0,0,0.36)]">
      {filters.map((filter) => {
        const active = eventFilter === filter.id

        return (
          <button
            key={filter.id}
            type="button"
            className={clsx(
              'min-h-7 border-r border-[color:rgba(255,255,255,0.08)] px-1 font-hud text-[0.52rem] uppercase tracking-[0.12em] transition-[background-color,color,box-shadow] duration-150 last:border-r-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--border-glow)]',
              active
                ? 'bg-[color:rgba(51,170,255,0.12)] text-[color:var(--text-primary)] shadow-[inset_0_0_18px_rgba(51,170,255,0.12)]'
                : 'text-[color:rgba(196,228,255,0.48)] hover:bg-[color:rgba(255,255,255,0.04)] hover:text-[color:var(--text-primary)]',
            )}
            onClick={() => setEventFilter(filter.id)}
            aria-pressed={active}
          >
            {filter.label}
          </button>
        )
      })}
    </div>
  )
}
