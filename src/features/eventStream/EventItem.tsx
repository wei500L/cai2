import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { factionById, type FactionId } from '@/mock/factions'
import type { EventKind, GameEvent } from '@/mock/types'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { EventBadge } from './EventBadge'

type EventItemProps = {
  event: GameEvent
  selected: boolean
  relativeTime: string
  onFocus: (event: GameEvent) => void
}

const kindLabels: Record<EventKind, string> = {
  speech: '演说',
  private: '密谈',
  reaction: '回应',
  narration: '旁白',
  treaty: '条约',
  military: '军令',
  declare_war: '宣战',
  alliance: '结盟',
  trade: '贸易',
  betrayal: '背叛',
  battle: '战斗',
  economy: '经济',
  intel: '情报',
  peace: '和平',
  phase_change: '阶段',
}

const kindIcons: Record<EventKind, string> = {
  speech: 'S',
  private: 'Q',
  reaction: 'R',
  narration: 'N',
  treaty: 'T',
  military: 'M',
  declare_war: '!',
  alliance: 'A',
  trade: '$',
  betrayal: 'X',
  battle: 'B',
  economy: 'E',
  intel: 'I',
  peace: 'P',
  phase_change: 'P',
}

function getFactionLabel(id?: FactionId) {
  return id ? factionById[id].name : null
}

function getFactionShortName(id?: FactionId) {
  const label = getFactionLabel(id)
  return label ? label.slice(0, 1) : 'SYS'
}

function getEventFaction(event: GameEvent) {
  return resolveFactionId(event.actor) ?? resolveFactionId(event.target) ?? 'starlight'
}

function getPriorityFrame(event: GameEvent, factionGlow: string, factionShadow: string) {
  if (event.priority === 'P0') {
    return {
      borderColor: 'rgba(255, 102, 102, 0.95)',
      boxShadow:
        '0 0 0 1px rgba(255, 102, 102, 0.82), 0 0 18px rgba(255, 55, 55, 0.35), inset 0 0 18px rgba(255, 45, 45, 0.08)',
    }
  }

  if (event.priority === 'P1') {
    return {
      borderColor: factionGlow,
      boxShadow: `0 0 0 1px ${factionGlow}, 0 0 14px ${factionShadow}, inset 0 0 14px rgba(255,255,255,0.035)`,
    }
  }

  return {
    borderColor: 'rgba(210, 220, 230, 0.24)',
    boxShadow: '0 0 0 1px rgba(210, 220, 230, 0.08)',
  }
}

export function EventItem({ event, selected, relativeTime, onFocus }: EventItemProps) {
  const factionId = getEventFaction(event)
  const faction = factionTokens[factionId]
  const actorName = getFactionLabel(event.actor)
  const targetName = getFactionLabel(event.target)
  const frame = getPriorityFrame(event, faction.glow, faction.shadow)
  const actorLabel = actorName ?? '系统'
  const targetLabel = targetName ?? '全域'
  const eventStyle = {
    '--event-faction-glow': faction.glow,
    '--event-faction-shadow': faction.shadow,
    '--event-faction-primary': faction.primary,
    borderColor: frame.borderColor,
    boxShadow: frame.boxShadow,
  } as CSSProperties

  return (
    <motion.button
      type="button"
      data-event-id={event.id}
      className={clsx(
        'group relative block w-full border bg-[color:rgba(2,6,12,0.82)] px-3 pb-3 pt-5 text-left transition-[background-color,filter] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--event-faction-glow)]',
        selected && 'bg-[color:rgba(9,19,30,0.94)] brightness-125',
      )}
      style={eventStyle}
      onClick={() => onFocus(event)}
      initial={{
        x: -16,
        opacity: 0,
        boxShadow: frame.boxShadow,
      }}
      animate={{
        x: 0,
        opacity: 1,
        boxShadow:
          event.priority === 'P2'
            ? frame.boxShadow
            : [
                frame.boxShadow,
                `0 0 0 1px ${event.priority === 'P0' ? 'rgba(255, 102, 102, 1)' : faction.glow}, 0 0 26px ${
                  event.priority === 'P0' ? 'rgba(255, 60, 60, 0.58)' : faction.glow
                }, inset 0 0 18px rgba(255,255,255,0.06)`,
                frame.boxShadow,
              ],
      }}
      transition={{
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <EventBadge priority={event.priority} />

      <div className="flex items-start gap-2">
        <div
          className="grid h-8 w-8 flex-none place-items-center border font-hud text-[0.7rem] font-bold"
          style={{
            borderColor: event.priority === 'P0' ? 'rgba(255,102,102,0.88)' : faction.glow,
            background: 'rgba(0,0,0,0.58)',
            color: event.priority === 'P0' ? '#ffd2d2' : faction.glow,
            boxShadow: `inset 0 0 12px ${event.priority === 'P0' ? 'rgba(255,68,68,0.18)' : faction.shadow}`,
          }}
          aria-hidden
        >
          {kindIcons[event.kind]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <div
              className="grid h-6 w-6 flex-none place-items-center border font-hud text-[0.5rem] font-bold"
              style={{
                borderColor: faction.glow,
                background: faction.primary,
                color: 'var(--text-primary)',
                boxShadow: `0 0 12px ${faction.shadow}`,
              }}
              title={actorName ?? targetName ?? '系统'}
            >
              {getFactionShortName(event.actor ?? event.target)}
            </div>
            <span className="border border-[color:rgba(255,255,255,0.13)] bg-[color:rgba(0,0,0,0.42)] px-1.5 py-0.5 font-hud text-[0.52rem] uppercase tracking-[0.14em] text-[color:rgba(196,228,255,0.78)]">
              {kindLabels[event.kind]}
            </span>
            <span className="ml-auto flex-none font-hud text-[0.52rem] uppercase tracking-[0.12em] text-[color:rgba(196,228,255,0.46)]">
              {relativeTime}
            </span>
          </div>

          <div className="mb-1 min-w-0 truncate font-hud text-[0.62rem] tracking-[0.04em] text-[color:rgba(244,251,255,0.92)]">
            <span style={{ color: faction.glow }}>{actorLabel}</span>
            <span className="px-1 text-[color:rgba(196,228,255,0.42)]">→</span>
            <span>{targetLabel}</span>
          </div>

          <p className="line-clamp-3 break-words text-[0.72rem] leading-5 text-[color:rgba(232,243,250,0.88)]">
            {event.narration}
          </p>
        </div>
      </div>
    </motion.button>
  )
}
