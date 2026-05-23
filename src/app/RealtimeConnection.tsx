import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ENV } from '@/app/env'
import { incrementMockEventEmittedCount, setConnectionDebugSnapshot } from '@/app/connectionDebug'
import { fetchFactionsMeta } from '@/api/factionsMetaApi'
import { ConnectionErrorPanel } from '@/components/ConnectionErrorPanel'
import { DevModeBanner } from '@/components/DevModeBanner'
import { factionMetaFixtures } from '@/mock/factions'
import { startMockGameLoop } from '@/mock/gameLoop'
import { attachAdapter } from '@/protocol/adapter'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { createTransport } from '@/protocol/transport'
import type { MockTransport, Transport, TransportStatus } from '@/protocol/transport'
import type { IncomingMessage } from '@/protocol/types'
import { factionMetaStore } from '@/store/factionMetaStore'
import { gameStoreApi } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

const FORCE_MOCK_SESSION_KEY = 'diplomacy_force_mock_once'

type ReconnectableTransport = Transport & {
  setReconnectContext?: (context: {
    roomId?: string
    playerId?: string
    sessionToken?: string
  }) => void
}

type TransportMode = 'ws' | 'mock'

function consumeMockModeOverride() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const active = window.sessionStorage.getItem(FORCE_MOCK_SESSION_KEY) === '1'
    if (active) {
      window.sessionStorage.removeItem(FORCE_MOCK_SESSION_KEY)
    }
    return active
  } catch {
    return false
  }
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
  const handledFailureRef = useRef(false)
  const [transportMode] = useState<TransportMode>(() =>
    ENV.useWs && consumeMockModeOverride() ? 'mock' : ENV.useWs ? 'ws' : 'mock',
  )
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [connectionAttemptAt, setConnectionAttemptAt] = useState(() => Date.now())
  const [connectionErrorCode, setConnectionErrorCode] = useState<string | null>(null)
  const [showConnectionErrorPanel, setShowConnectionErrorPanel] = useState(false)
  const setConnectionStatus = useUIStore((state) => state.setConnectionStatus)
  const connectionFailureReason = useUIStore((state) => state.connectionFailureReason)
  const setConnectionFailureReason = useUIStore((state) => state.setConnectionFailureReason)
  const setLastHeartbeatTs = useUIStore((state) => state.setLastHeartbeatTs)
  const roomIdFromQuery = useMemo(() => getQueryParam('room_id'), [])
  const playerIdFromQuery = useMemo(() => getQueryParam('player_id'), [])
  const displayNameFromQuery = useMemo(
    () => getQueryParam('display_name') || 'Player',
    [],
  )

  useEffect(() => {
    let cancelled = false
    let roomId = roomIdFromQuery || 'mock-room'
    let playerId = playerIdFromQuery || ''
    let joinRequested = false
    const restFallbackAbortController = new AbortController()

    factionMetaStore.getState().reset()
    if (transportMode === 'mock') {
      factionMetaStore.getState().applyFromMock(factionMetaFixtures)
    }
    handledFailureRef.current = false
    setConnectionFailureReason(null)
    setConnectionDebugSnapshot({
      lastInboundSeq: 0,
      queueDepth: 0,
      wsUrl: ENV.wsUrl,
      mockEventEmittedCount: 0,
    })

    const transport = createTransport(
      transportMode === 'ws'
        ? {
            kind: 'ws',
            ws: {
              url: ENV.wsUrl,
              token: ENV.wsToken,
              clientVersion: ENV.clientVersion,
              playerId: playerIdFromQuery || undefined,
              heartbeatIntervalMs: ENV.heartbeatMs,
              onStatusChange: (status: TransportStatus) => {
                if (cancelled) {
                  return
                }

                if (status === 'connecting' || status === 'reconnecting') {
                  setConnectionAttemptAt(Date.now())
                }

                if (status === 'open') {
                  setLastHeartbeatTs(Date.now())
                  setConnectionStatus(status)
                  setConnectionFailureReason(null)
                  setConnectionErrorCode(null)
                  setShowConnectionErrorPanel(false)
                  return
                }

                setConnectionStatus(status)

                if (status !== 'error' && status !== 'closed') {
                  return
                }

                if (handledFailureRef.current) {
                  return
                }

                handledFailureRef.current = true
                const failureCode = status === 'error' ? 'WS_ERROR' : 'WS_CLOSED'
                const currentReason = useUIStore.getState().connectionFailureReason
                setConnectionErrorCode(failureCode)
                if (!currentReason) {
                  setConnectionFailureReason(failureCode)
                }

                setShowConnectionErrorPanel(true)
              },
            },
          }
        : { kind: 'mock' },
    )

    transportRef.current = transport
    publishConnectionDebugSnapshot(transport)

    const detachAdapter = attachAdapter(transport, gameStoreApi)
    ActionDispatcher.setTransport(transport)

    const handleTransportMessage = (message: IncomingMessage) => {
      if (cancelled) {
        return
      }

      if (transportMode === 'mock') {
        incrementMockEventEmittedCount()
      }

      publishConnectionDebugSnapshot(transport)

      if (message.t === 'conn.pong') {
        setLastHeartbeatTs(Date.now())
      }

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

    transport.on(handleTransportMessage)
    transport.connect()

    const restFallbackTimer = window.setTimeout(() => {
      if (cancelled || transportMode !== 'ws' || factionMetaStore.getState().source !== 'pending') {
        return
      }

      fetchFactionsMeta(roomId, restFallbackAbortController.signal)
        .then((meta) => {
          if (cancelled || factionMetaStore.getState().source !== 'pending') {
            return
          }

          factionMetaStore.getState().applyFromRest(meta)
        })
        .catch((error: unknown) => {
          if (cancelled || restFallbackAbortController.signal.aborted) {
            return
          }

          const message = error instanceof Error ? error.message : 'FACTIONS_META_REST_FAILED'
          setConnectionAttemptAt(Date.now())
          setConnectionFailureReason(message)
          setConnectionErrorCode('FACTIONS_META_REST_FAILED')
          setConnectionStatus('error')
          setShowConnectionErrorPanel(true)
        })
    }, 3000)

    if (transportMode === 'mock') {
      setConnectionStatus('open')
      setLastHeartbeatTs(0)
      stopMockLoopRef.current?.()
      stopMockLoopRef.current = null
      if (pathname === '/game') {
        stopMockLoopRef.current = startMockGameLoop(transport as MockTransport)
      }
    }

    return () => {
      cancelled = true
      window.clearTimeout(restFallbackTimer)
      restFallbackAbortController.abort()
      stopMockLoopRef.current?.()
      stopMockLoopRef.current = null
      ActionDispatcher.setTransport(null)
      transport.off(handleTransportMessage)
      detachAdapter()
      transport.disconnect()
      transportRef.current = null
    }
  }, [
    connectionRevision,
    displayNameFromQuery,
    pathname,
    playerIdFromQuery,
    roomIdFromQuery,
    setConnectionFailureReason,
    setConnectionStatus,
    setLastHeartbeatTs,
    transportMode,
  ])

  const connectionFailureVisible =
    showConnectionErrorPanel && transportMode === 'ws'

  const failureCode = connectionFailureReason ?? connectionErrorCode ?? 'UNKNOWN'

  return (
    <>
      <DevModeBanner />
      {connectionFailureVisible ? (
        <ConnectionErrorPanel
          wsUrl={ENV.wsUrl}
          errorCode={failureCode}
          lastAttemptAt={connectionAttemptAt}
          onRetry={() => {
            setConnectionAttemptAt(Date.now())
            setConnectionErrorCode(null)
            setConnectionFailureReason(null)
            setShowConnectionErrorPanel(false)
            setConnectionRevision((value) => value + 1)
          }}
          onSwitchToMock={() => {
            if (typeof window === 'undefined') {
              return
            }

            window.sessionStorage.setItem(FORCE_MOCK_SESSION_KEY, '1')
            window.location.reload()
          }}
        />
      ) : null}
      {children}
    </>
  )
}
