import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { ENV } from '@/app/env'
import { setConnectionDebugSnapshot } from '@/app/connectionDebug'
import { startMockGameLoop } from '@/mock/gameLoop'
import { attachAdapter } from '@/protocol/adapter'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { createTransport } from '@/protocol/transport'
import type { MockTransport, Transport, TransportStatus } from '@/protocol/transport'
import type { IncomingMessage } from '@/protocol/types'
import { gameStoreApi } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

type ReconnectableTransport = Transport & {
  setReconnectContext?: (context: {
    roomId?: string
    playerId?: string
    sessionToken?: string
  }) => void
}

function publishConnectionDebugSnapshot(transport: Transport) {
  const source = transport as {
    getLastInboundSeq?: () => number
    getQueueDepth?: () => number
  }

  setConnectionDebugSnapshot({
    lastInboundSeq: source.getLastInboundSeq?.() ?? 0,
    queueDepth: source.getQueueDepth?.() ?? 0,
    wsUrl: ENV.wsUrl,
  })
}

function getQueryParam(name: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export function RealtimeConnection({
  pathname,
  children,
}: {
  pathname: string
  children: ReactNode
}) {
  const transportRef = useRef<Transport | null>(null)
  const stopMockLoopRef = useRef<(() => void) | null>(null)
  const setConnectionStatus = useUIStore((state) => state.setConnectionStatus)
  const roomIdFromQuery = useMemo(() => getQueryParam('room_id'), [])
  const playerIdFromQuery = useMemo(() => getQueryParam('player_id'), [])
  const displayNameFromQuery = useMemo(
    () => getQueryParam('display_name') || 'Player',
    [],
  )

  useEffect(() => {
    let roomId = roomIdFromQuery || 'mock-room'
    let playerId = playerIdFromQuery || ''
    let joinRequested = false

    const handleStatusChange = (status: TransportStatus) => {
      setConnectionStatus(status)
      if (transportRef.current) {
        publishConnectionDebugSnapshot(transportRef.current)
      }
    }

    const handleReconnectContextMessage = (message: IncomingMessage) => {
      if (message.t === 'conn.auth.ok') {
        playerId = message.p.player_id
        if (roomIdFromQuery && !joinRequested) {
          joinRequested = true
          ActionDispatcher.joinRoom(roomIdFromQuery, displayNameFromQuery)
        }
      }

      if ('room_id' in message.p && typeof message.p.room_id === 'string') {
        roomId = message.p.room_id
      }

      if (
        message.t === 'room.joined' &&
        typeof message.p.room_snapshot === 'object' &&
        message.p.room_snapshot !== null
      ) {
        const snapshot = message.p.room_snapshot as Record<string, unknown>
        const nextPlayerId = snapshot.current_player_id
        if (typeof nextPlayerId === 'string') {
          playerId = nextPlayerId
        }

        const room = snapshot.room as Record<string, unknown> | undefined
        const nextRoomId = room?.id
        if (typeof nextRoomId === 'string') {
          roomId = nextRoomId
        }
      }

      const reconnectable = transportRef.current as ReconnectableTransport | null
      reconnectable?.setReconnectContext?.({
        roomId,
        playerId,
        sessionToken: ENV.wsToken,
      })
    }

    const transport = createTransport(
      ENV.useWs
        ? {
            kind: 'ws',
            ws: {
              url: ENV.wsUrl,
              token: ENV.wsToken,
              clientVersion: ENV.clientVersion,
              playerId: playerIdFromQuery || undefined,
              heartbeatIntervalMs: ENV.heartbeatMs,
              onStatusChange: handleStatusChange,
            },
          }
        : { kind: 'mock' },
    )

    transportRef.current = transport
    setConnectionStatus('idle')
    publishConnectionDebugSnapshot(transport)
    const detachAdapter = attachAdapter(transport, gameStoreApi)
    ActionDispatcher.setTransport(transport)
    const handleDebugMessage = () => publishConnectionDebugSnapshot(transport)
    transport.on(handleDebugMessage)
    transport.on(handleReconnectContextMessage)
    transport.connect()

    if (!ENV.useWs && pathname === '/game') {
      stopMockLoopRef.current = startMockGameLoop(transport as MockTransport)
    }

    return () => {
      stopMockLoopRef.current?.()
      stopMockLoopRef.current = null
      ActionDispatcher.setTransport(null)
      transport.off(handleDebugMessage)
      transport.off(handleReconnectContextMessage)
      detachAdapter()
      transport.disconnect()
      transportRef.current = null
    }
  }, [displayNameFromQuery, pathname, playerIdFromQuery, roomIdFromQuery, setConnectionStatus])

  useEffect(() => {
    const transport = transportRef.current
    if (!transport || ENV.useWs) {
      return
    }

    stopMockLoopRef.current?.()
    stopMockLoopRef.current = null
    if (pathname === '/game') {
      stopMockLoopRef.current = startMockGameLoop(transport as MockTransport)
    }

    return () => {
      stopMockLoopRef.current?.()
      stopMockLoopRef.current = null
    }
  }, [pathname])

  return children
}
