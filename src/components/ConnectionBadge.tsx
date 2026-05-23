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
}

const statusVisuals: Record<TransportStatus, StatusVisual> = {
  idle: {
    text: 'idle',
    border: 'rgba(93, 103, 116, 0.62)',
    shadow: '0 0 0 1px rgba(93, 103, 116, 0.36), 0 0 12px rgba(93, 103, 116, 0.14)',
    dot: 'rgba(122, 133, 147, 0.76)',
    textColor: 'rgba(186, 198, 211, 0.72)',
  },
  connecting: {
    text: 'connecting',
    border: 'rgba(45, 212, 191, 0.7)',
    shadow: '0 0 0 1px rgba(45, 212, 191, 0.42), 0 0 16px rgba(45, 212, 191, 0.22)',
    dot: 'rgba(45, 212, 191, 0.95)',
    textColor: 'rgba(188, 255, 247, 0.84)',
    pulse: true,
  },
  open: {
    text: 'open',
    border: 'rgba(112, 255, 166, 0.68)',
    shadow: '0 0 0 1px rgba(112, 255, 166, 0.36), 0 0 14px rgba(112, 255, 166, 0.18)',
    dot: 'rgba(112, 255, 166, 0.95)',
    textColor: 'rgba(205, 255, 224, 0.86)',
  },
  reconnecting: {
    text: 'reconnecting',
    border: 'rgba(255, 178, 84, 0.76)',
    shadow: '0 0 0 1px rgba(255, 178, 84, 0.42), 0 0 18px rgba(255, 178, 84, 0.24)',
    dot: 'rgba(255, 178, 84, 0.95)',
    textColor: 'rgba(255, 226, 186, 0.86)',
    pulse: true,
  },
  closed: {
    text: 'closed',
    border: 'rgba(132, 42, 50, 0.76)',
    shadow: '0 0 0 1px rgba(132, 42, 50, 0.42), 0 0 12px rgba(132, 42, 50, 0.18)',
    dot: 'rgba(158, 58, 68, 0.9)',
    textColor: 'rgba(238, 174, 181, 0.78)',
  },
  error: {
    text: 'error',
    border: 'rgba(255, 82, 96, 0.86)',
    shadow: '0 0 0 1px rgba(255, 82, 96, 0.5), 0 0 18px rgba(255, 82, 96, 0.28)',
    dot: 'rgba(255, 82, 96, 1)',
    textColor: 'rgba(255, 205, 210, 0.9)',
    shake: true,
  },
}

export function ConnectionBadge() {
  const status = useUIStore((state) => state.connectionStatus)
  const debug = useConnectionDebugSnapshot()
  const visual = statusVisuals[status]
  const tooltip = import.meta.env.DEV
    ? `lastInboundSeq: ${debug.lastInboundSeq}\nqueueDepth: ${debug.queueDepth}\nwsUrl: ${debug.wsUrl || ENV.wsUrl}`
    : undefined

  return (
    <motion.div
      className="h-7 w-[118px] shrink-0"
      animate={visual.shake ? { x: [0, -1, 1, -1, 1, 0] } : { x: 0 }}
      transition={{ duration: 0.28, repeat: visual.shake ? Infinity : 0, repeatDelay: 1.2 }}
      title={tooltip}
      aria-label={`transport ${status}`}
    >
      <GlowPanel
        tone="neutral"
        className="h-7 rounded-[6px]"
        style={
          {
            borderColor: visual.border,
            boxShadow: visual.shadow,
          } as CSSProperties
        }
      >
        <div
          className="flex h-7 items-center justify-center gap-2 px-2 font-hud text-[0.54rem] uppercase tracking-[0.08em]"
          style={{ color: visual.textColor }}
        >
          <span
            aria-hidden
            className={clsx('h-1 w-1 shrink-0 rounded-full', visual.pulse && 'animate-pulse')}
            style={{ backgroundColor: visual.dot, boxShadow: `0 0 8px ${visual.dot}` }}
          />
          <span className="min-w-0 truncate">{visual.text}</span>
        </div>
      </GlowPanel>
    </motion.div>
  )
}
