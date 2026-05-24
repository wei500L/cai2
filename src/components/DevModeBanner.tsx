import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { ENV } from '@/app/env'
import { useConnectionDebugSnapshot } from '@/app/connectionDebug'
import { useUIStore } from '@/store/uiStore'

function formatHeartbeatAge(lastHeartbeatTs: number) {
  if (!lastHeartbeatTs) {
    return 'n/a'
  }

  const seconds = Math.max(0, Math.floor((Date.now() - lastHeartbeatTs) / 1000))
  return `${seconds}s ago`
}

export function DevModeBanner() {
  const connectionStatus = useUIStore((state) => state.connectionStatus)
  const lastHeartbeatTs = useUIStore((state) => state.lastHeartbeatTs)
  const debug = useConnectionDebugSnapshot()
  const [collapsed, setCollapsed] = useState(false)
  const isProduction = import.meta.env.PROD
  const isMockMode = ENV.allowMockFallback || (connectionStatus === 'open' && lastHeartbeatTs === 0)
  const isRealConnected = !ENV.allowMockFallback && connectionStatus === 'open' && lastHeartbeatTs > 0
  const isRealDisconnected =
    !ENV.allowMockFallback && (connectionStatus === 'error' || connectionStatus === 'closed')

  useEffect(() => {
    if (!isRealConnected) {
      return undefined
    }

    const timer = window.setTimeout(() => setCollapsed(true), 5_000)
    return () => window.clearTimeout(timer)
  }, [isRealConnected])

  const title = useMemo(() => {
    if (isMockMode) {
      return 'MOCK MODE'
    }

    if (isRealConnected) {
      return 'REAL WS'
    }

    if (isRealDisconnected) {
      return 'REAL WS'
    }

    return ''
  }, [isMockMode, isRealConnected, isRealDisconnected])

  if (isProduction) {
    return null
  }

  if (isMockMode) {
    return (
      <motion.div
        className="fixed inset-x-0 top-0 z-[210] flex min-h-6 items-center overflow-hidden border-b border-[color:rgba(255,168,64,0.45)] bg-[color:rgba(34,18,6,0.96)] px-2 py-1 font-hud text-[0.5rem] leading-none tracking-[0.12em] text-[color:rgba(255,224,186,0.92)] sm:h-6 sm:px-3 sm:text-[0.58rem] sm:tracking-[0.14em]"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <span className="animate-pulse sm:hidden">
          MOCK MODE · mockEvents={debug.mockEventEmittedCount}
        </span>
        <span className="hidden animate-pulse sm:inline">
          MOCK MODE · 该模式仅供 dev 调试 · 后端事件不会响应 · mockEvents={debug.mockEventEmittedCount}
        </span>
      </motion.div>
    )
  }

  if (isRealConnected) {
    if (collapsed) {
      return (
        <div
          className="fixed right-2 top-2 z-[210] h-2 w-2 rounded-full border border-[color:rgba(112,255,166,0.72)] bg-[color:rgba(112,255,166,0.92)]"
          title={`${title} · ${ENV.wsUrl} · seq=${debug.lastInboundSeq}`}
          aria-label={`${title} connected`}
        />
      )
    }

    return (
      <motion.div
        className="fixed inset-x-0 top-0 z-[210] flex h-6 items-center border-b border-[color:rgba(112,255,166,0.42)] bg-[color:rgba(6,24,14,0.96)] px-3 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(205,255,224,0.94)]"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <span>
          REAL WS · {ENV.wsUrl} · seq={debug.lastInboundSeq}
        </span>
      </motion.div>
    )
  }

  if (!isRealDisconnected) {
    return null
  }

  return (
    <motion.div
      className={clsx(
        'fixed inset-x-0 top-0 z-[210] flex h-6 items-center border-b px-3 font-hud text-[0.58rem] tracking-[0.14em]',
        'bg-[color:rgba(32,7,11,0.96)] text-[color:rgba(255,210,214,0.94)]',
      )}
      style={{ borderColor: 'rgba(255,82,96,0.45)' }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      title={`${ENV.wsUrl} · lastHeartbeat=${lastHeartbeatTs || 0}`}
    >
      <span>
        REAL WS · DISCONNECTED · 上次心跳 {formatHeartbeatAge(lastHeartbeatTs)}
      </span>
    </motion.div>
  )
}
