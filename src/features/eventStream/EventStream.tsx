import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { HoloDivider } from '@/components/HoloDivider'
import { PixelButton } from '@/components/PixelButton'
import type { EventFilter } from '@/store/uiStore'
import { useUIStore } from '@/store/uiStore'
import { useGameStore } from '@/store/gameStore'
import type { GameEvent } from '@/mock/types'
import { EventFilters } from './EventFilters'
import { EventGroup } from './EventGroup'
import { useEventFocus } from './useEventFocus'

type EventStreamProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

type EventGroupModel = {
  key: string
  label: string
  epoch: number
  turn: number
  events: GameEvent[]
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function formatRelativeTime(createdAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000))

  if (seconds < 60) {
    return `${seconds}秒前`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}分钟前`
  }

  return `${Math.floor(minutes / 60)}小时前`
}

function isMineEvent(event: GameEvent, selectedFactionId: string | null) {
  if (event.kind === 'phase_change' || event.kind === 'narration') {
    return true
  }

  if (!selectedFactionId) {
    return false
  }

  return event.actor === selectedFactionId || event.target === selectedFactionId
}

function filterEvents(events: GameEvent[], filter: EventFilter, selectedFactionId: string | null) {
  if (filter === 'P0' || filter === 'P1') {
    return events.filter((event) => event.priority === filter)
  }

  if (filter === 'mine') {
    return events.filter((event) => isMineEvent(event, selectedFactionId))
  }

  return events
}

function groupEvents(events: GameEvent[]) {
  const map = new Map<string, EventGroupModel>()

  events.forEach((event) => {
    const key = `${event.epoch}:${event.turn}`
    const group = map.get(key)

    if (group) {
      group.events.push(event)
      return
    }

    map.set(key, {
      key,
      label: `E${event.epoch} / T${event.turn}`,
      epoch: event.epoch,
      turn: event.turn,
      events: [event],
    })
  })

  return Array.from(map.values())
}

export function EventStream({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: EventStreamProps) {
  const events = useGameStore((state) => state.events)
  const epoch = useGameStore((state) => state.epoch)
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const eventFilter = useUIStore((state) => state.eventFilter)
  const eventStreamScrollMode = useUIStore((state) => state.eventStreamScrollMode)
  const setEventStreamScrollMode = useUIStore((state) => state.setEventStreamScrollMode)
  const setMapFocus = useUIStore((state) => state.setMapFocus)
  const focusEvent = useEventFocus()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [pulseP0, setPulseP0] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<HTMLDivElement | null>(null)
  const p0PulseTimerRef = useRef<number | null>(null)
  const latestEventId = events[0]?.id ?? null
  const currentGroupKey = `${epoch.id}:${epoch.turn}`

  const filteredEvents = useMemo(
    () => filterEvents(events, eventFilter, selectedFactionId),
    [eventFilter, events, selectedFactionId],
  )
  const groups = useMemo(() => groupEvents(filteredEvents), [filteredEvents])
  const visibleEvents = useMemo(
    () => groups.flatMap((group) => (collapsedGroups.has(group.key) ? [] : group.events)),
    [collapsedGroups, groups],
  )

  const getRelativeTime = useCallback(
    (createdAt: number) => formatRelativeTime(createdAt, now),
    [now],
  )

  const handleFocusEvent = useCallback(
    (event: GameEvent) => {
      setSelectedEventId(event.id)
      focusEvent(event)
    },
    [focusEvent],
  )

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }, [])

  const returnToLatest = useCallback(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setEventStreamScrollMode('auto')
  }, [setEventStreamScrollMode])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setCollapsedGroups((current) => {
      if (!current.has(currentGroupKey)) {
        return current
      }

      const next = new Set(current)
      next.delete(currentGroupKey)
      return next
    })
  }, [currentGroupKey])

  useEffect(() => {
    if (eventStreamScrollMode === 'auto') {
      listRef.current?.scrollTo({ top: 0 })
    }
  }, [eventStreamScrollMode, latestEventId])

  useEffect(() => {
    const latest = events[0]
    if (latest?.priority !== 'P0') {
      return
    }

    setPulseP0(true)
    if (p0PulseTimerRef.current) {
      window.clearTimeout(p0PulseTimerRef.current)
    }

    p0PulseTimerRef.current = window.setTimeout(() => {
      setPulseP0(false)
      p0PulseTimerRef.current = null
    }, 620)

    return () => {
      if (p0PulseTimerRef.current) {
        window.clearTimeout(p0PulseTimerRef.current)
        p0PulseTimerRef.current = null
      }
    }
  }, [latestEventId, events])

  useEffect(() => {
    if (!selectedEventId) {
      return
    }

    const node = listRef.current?.querySelector<HTMLElement>(`[data-event-id="${selectedEventId}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedEventId])

  useEffect(() => {
    if (selectedEventId && visibleEvents.some((event) => event.id === selectedEventId)) {
      return
    }

    setSelectedEventId(visibleEvents[0]?.id ?? null)
  }, [selectedEventId, visibleEvents])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setIsFullscreen((current) => !current)
        onToggleFullscreen?.()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedEventId(null)
        setMapFocus(null)
        console.info('[EventStream] mapFocus', null)
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }

      if (visibleEvents.length === 0) {
        return
      }

      event.preventDefault()
      const currentIndex = visibleEvents.findIndex((item) => item.id === selectedEventId)
      const fallbackIndex = event.key === 'ArrowDown' ? -1 : visibleEvents.length
      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min((currentIndex >= 0 ? currentIndex : fallbackIndex) + 1, visibleEvents.length - 1)
          : Math.max((currentIndex >= 0 ? currentIndex : fallbackIndex) - 1, 0)
      handleFocusEvent(visibleEvents[nextIndex])
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleFocusEvent, onToggleFullscreen, selectedEventId, setMapFocus, visibleEvents])

  const handleScroll = useCallback(() => {
    const node = listRef.current
    if (!node) {
      return
    }

    setEventStreamScrollMode(node.scrollTop <= 12 ? 'auto' : 'manual')
  }, [setEventStreamScrollMode])

  return (
    <aside
      className={clsx(
        'event-stream-root flex h-full min-h-0 flex-col overflow-hidden border bg-[color:rgba(0,0,0,0.76)] text-[color:var(--text-primary)]',
        pulseP0 && 'event-stream-p0-pulse',
        isFullscreen
          ? 'fixed left-0 top-0 z-[70] h-screen w-[min(60vw,58rem)] max-w-[calc(100vw-1rem)]'
          : 'relative w-full',
      )}
      style={{
        borderColor: pulseP0 ? 'rgba(255,102,102,0.78)' : 'var(--border-glow)',
        boxShadow: pulseP0
          ? '0 0 0 1px rgba(255,102,102,0.78), 0 0 40px rgba(255,40,40,0.24)'
          : '0 0 0 1px var(--border-glow), 0 0 24px rgba(51,170,255,0.16)',
      }}
    >
      <div className="flex flex-none items-center justify-between gap-3 px-3 py-3 font-hud">
        <div className="min-w-0">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--text-primary)]">
            事件流
          </div>
          <div className="mt-1 text-[0.5rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.42)]">
            {filteredEvents.length} SIGNALS / {eventStreamScrollMode.toUpperCase()}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          <PixelButton
            tone="ghost"
            className="px-2 py-1 text-[0.54rem] tracking-[0.14em]"
            onClick={onToggleCollapsed}
          >
            {collapsed ? '展开' : '折叠'}
          </PixelButton>
          <PixelButton
            tone={isFullscreen ? 'primary' : 'ghost'}
            className="px-2 py-1 text-[0.54rem] tracking-[0.14em]"
            onClick={() => {
              setIsFullscreen((current) => !current)
              onToggleFullscreen?.()
            }}
          >
            {isFullscreen ? '还原' : '全屏'}
          </PixelButton>
        </div>
      </div>

      <div className="px-3 pb-3">
        <EventFilters />
      </div>
      <HoloDivider />

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          className="event-stream-scroll h-full overflow-y-auto px-3 py-3"
          onScroll={handleScroll}
        >
          {groups.length > 0 ? (
            <div className="grid gap-3 pb-14">
              {groups.map((group) => (
                <EventGroup
                  key={group.key}
                  groupKey={group.key}
                  label={group.label}
                  events={group.events}
                  collapsed={collapsedGroups.has(group.key)}
                  isCurrent={group.key === currentGroupKey}
                  selectedEventId={selectedEventId}
                  getRelativeTime={getRelativeTime}
                  onToggle={toggleGroup}
                  onFocusEvent={handleFocusEvent}
                />
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(0,0,0,0.32)] px-4 text-center font-hud text-[0.62rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.46)]">
              无匹配事件
            </div>
          )}
        </div>

        {eventStreamScrollMode === 'manual' ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
            <PixelButton
              tone="primary"
              className="pointer-events-auto px-3 py-1.5 text-[0.56rem] tracking-[0.16em]"
              onClick={returnToLatest}
            >
              返回最新
            </PixelButton>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
