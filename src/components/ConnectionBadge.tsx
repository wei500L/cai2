import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { ENV } from '@/app/env'
import { useConnectionDebugSnapshot } from '@/app/connectionDebug'
import { GlowPanel } from '@/components/GlowPanel'
import { useUIStore } from '@/store/uiStore'
import type { TransportStatus } from '@/protocol/transport'

type StatusVisual = {
  text: string
  border: string
  shadow: string
  dot: string
  textColor: string
  pulse?: boolean
  shake?: boolean
  background: string
}

const statusVisuals: Record<TransportStatus, StatusVisual> = {
  idle: {
    text: 'IDLE',
    border: 'rgba(93, 103, 116, 0.62)',
    shadow: '0 0 0 1px rgba(93, 103, 116, 0.36), 0 0 12px rgba(93, 103, 116, 0.14)',
    dot: 'rgba(122, 133, 147, 0.76)',
    textColor: 'rgba(186, 198, 211, 0.72)',
    background: 'rgba(12, 18, 26, 0.96)',
  },
  connecting: {
    text: 'CONN',
    border: 'rgba(45, 212, 191, 0.7)',
    shadow: '0 0 0 1px rgba(45, 212, 191, 0.42), 0 0 16px rgba(45, 212, 191, 0.22)',
    dot: 'rgba(45, 212, 191, 0.95)',
    textColor: 'rgba(188, 255, 247, 0.84)',
    pulse: true,
    background: 'rgba(7, 24, 22, 0.96)',
  },
  open: {
    text: 'OPEN',
    border: 'rgba(112, 255, 166, 0.68)',
    shadow: '0 0 0 1px rgba(112, 255, 166, 0.36), 0 0 14px rgba(112, 255, 166, 0.18)',
    dot: 'rgba(112, 255, 166, 0.95)',
    textColor: 'rgba(205, 255, 224, 0.86)',
    background: 'rgba(7, 22, 15, 0.96)',
  },
  reconnecting: {
    text: 'RECONN',
    border: 'rgba(255, 178, 84, 0.76)',
    shadow: '0 0 0 1px rgba(255, 178, 84, 0.42), 0 0 18px rgba(255, 178, 84, 0.24)',
    dot: 'rgba(255, 178, 84, 0.95)',
    textColor: 'rgba(255, 226, 186, 0.86)',
    pulse: true,
    background: 'rgba(22, 17, 7, 0.96)',
  },
  closed: {
    text: 'CLOSED',
    border: 'rgba(132, 42, 50, 0.76)',
    shadow: '0 0 0 1px rgba(132, 42, 50, 0.42), 0 0 12px rgba(132, 42, 50, 0.18)',
    dot: 'rgba(158, 58, 68, 0.9)',
    textColor: 'rgba(238, 174, 181, 0.78)',
    background: 'rgba(20, 10, 12, 0.96)',
  },
  error: {
    text: 'ERR',
    border: 'rgba(255, 82, 96, 0.86)',
    shadow: '0 0 0 1px rgba(255, 82, 96, 0.5), 0 0 18px rgba(255, 82, 96, 0.28)',
    dot: 'rgba(255, 82, 96, 1)',
    textColor: 'rgba(255, 205, 210, 0.9)',
    shake: true,
    background: 'rgba(34, 10, 13, 0.96)',
  },
}

export function ConnectionBadge() {
  const status = useUIStore((state) => state.connectionStatus)
  const lastSyncAt = useUIStore((state) => state.lastSyncAt)
  const connectionFailureReason = useUIStore((state) => state.connectionFailureReason)
  const debug = useConnectionDebugSnapshot()
  const visual = statusVisuals[status]
  const tooltip = [
    `lastSyncAt: ${lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleTimeString() : 'n/a'}`,
    `lastInboundSeq: ${debug.lastInboundSeq}`,
    `queueDepth: ${debug.queueDepth}`,
    `connectionFailureReason: ${connectionFailureReason ?? 'none'}`,
    import.meta.env.DEV ? `wsUrl: ${debug.wsUrl || ENV.wsUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
  const badgeText =
    status === 'error' && connectionFailureReason
      ? connectionFailureReason
      : visual.text

  return (
    <GlowPanel
      tone="neutral"
      className="h-7 w-[78px] shrink-0 rounded-[6px]"
      data-connection-badge
      title={tooltip}
      aria-label={`transport ${status}`}
      style={
        {
          backgroundColor: visual.background,
          borderColor: visual.border,
          boxShadow: visual.shadow,
        } as CSSProperties
      }
    >
      <motion.div
        className="h-7 w-full"
        animate={visual.shake ? { x: [0, -1, 1, -1, 1, 0] } : { x: 0 }}
        transition={{ duration: 0.28, repeat: visual.shake ? Infinity : 0, repeatDelay: 1.2 }}
      >
        <div
          className="flex h-7 items-center justify-center gap-1 px-1 font-hud text-[0.45rem] uppercase tracking-[0.04em]"
          style={{ color: visual.textColor }}
        >
          <span
            aria-hidden
            className={clsx('h-[0.28rem] w-[0.28rem] shrink-0 rounded-full', visual.pulse && 'animate-pulse')}
            style={{ backgroundColor: visual.dot, boxShadow: `0 0 8px ${visual.dot}` }}
          />
          <span className="min-w-0 truncate">{badgeText}</span>
        </div>
      </motion.div>
    </GlowPanel>
  )
}
