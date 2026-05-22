import { PixelButton } from '@/components/PixelButton'
import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { PublicSpeechBubble } from '@/features/aiSpeech/PublicSpeechBubble'
import type { FactionId } from '@/mock/factions'
import type { GameEvent } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

type EventStreamPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

function formatEventTime(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getPublicSpeechText(event: GameEvent) {
  if (event.kind !== 'speech' || !event.actor || event.payload.channel !== 'public') {
    return null
  }

  return typeof event.payload.text === 'string' ? event.payload.text : event.narration
}

export function EventStreamPanel({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: EventStreamPanelProps) {
  const events = useGameStore((state) => state.events)
  const visibleEvents = events.slice(0, 24)

  return (
    <GlowPanel className="h-full rounded-none">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 font-hud text-[0.7rem] uppercase tracking-[0.22em]">
          <span className="text-[color:var(--text-primary)]">事件流</span>
          <div className="flex items-center gap-2">
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleCollapsed}
            >
              {collapsed ? '展开' : '折叠'}
            </PixelButton>
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleFullscreen}
            >
              全屏
            </PixelButton>
          </div>
        </div>
        <HoloDivider />
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          <div className="grid gap-2">
            {visibleEvents.map((event) => (
              <div
                key={event.id}
                className="border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2"
              >
                <div className="mb-1 text-[0.54rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.46)]">
                  {event.priority} · {formatEventTime(event.createdAt)} · E{event.epoch}T{event.turn}
                </div>
                {getPublicSpeechText(event) ? (
                  <PublicSpeechBubble
                    actor={event.actor as FactionId}
                    text={getPublicSpeechText(event) ?? ''}
                    compact
                    showTail={false}
                  />
                ) : (
                  <div className="text-[0.72rem] leading-5 text-[color:var(--text-primary)]">
                    {event.narration}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
