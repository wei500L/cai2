import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ENV } from '@/app/env'
import { incrementMockEventEmittedCount, setConnectionDebugSnapshot } from '@/app/connectionDebug'
import { fetchFactionsMeta } from '@/api/factionsMetaApi'
import { ConnectionErrorPanel } from '@/components/ConnectionErrorPanel'
import { DevModeBanner } from '@/components/DevModeBanner'
import { attachAdapter } from '@/protocol/adapter'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { createTransport } from '@/protocol/transport'
import type { Transport, TransportStatus } from '@/protocol/transport'
import type { IncomingMessage } from '@/protocol/types'
import { epochSummaryStore } from '@/store/epochSummaryStore'
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

function showMetaFallbackToast(setToastMessage: (message: string | null) => void) {
  setToastMessage('WS 未下发势力元数据，正在 REST 兜底拉取...')
}

export function RealtimeConnection({
  pathname,
  children,
}: {
  pathname: string
  children: ReactNode
}) {
  const transportRef = useRef<Transport | null>(null)
  const handledFailureRef = useRef(false)
  const [transportMode] = useState<TransportMode>(() =>
    ENV.useWs && consumeMockModeOverride() ? 'mock' : ENV.useWs ? 'ws' : 'mock',
  )
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [connectionAttemptAt, setConnectionAttemptAt] = useState(() => Date.now())
  const [connectionErrorCode, setConnectionErrorCode] = useState<string | null>(null)
  const [showConnectionErrorPanel, setShowConnectionErrorPanel] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
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
    if (!toastMessage) {
      return undefined
    }

    const timer = window.setTimeout(() => setToastMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  useEffect(() => {
    let cancelled = false
    let roomId = roomIdFromQuery || 'mock-room'
    let playerId = playerIdFromQuery || ''
    let joinRequested = false
    const restFallbackAbortController = new AbortController()

    if (pathname === '/game') {
      gameStoreApi.getState().bootstrapEmpty()
    }

    factionMetaStore.getState().reset()
    epochSummaryStore.getState().reset()
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
        : { kind: 'mock', mock: { startGameLoop: pathname === '/game' } },
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

    const metadataTimeoutTimer = window.setTimeout(() => {
      if (cancelled || factionMetaStore.getState().source !== 'pending') {
        return
      }

      restFallbackAbortController.abort()
      setConnectionFailureReason('FACTIONS_META_TIMEOUT')
      setConnectionErrorCode('FACTIONS_META_TIMEOUT')
      setConnectionStatus('error')
      setShowConnectionErrorPanel(true)
    }, 5_000)

    const restFallbackTimer = window.setTimeout(() => {
      if (cancelled || transportMode !== 'ws' || factionMetaStore.getState().source !== 'pending') {
        return
      }

      showMetaFallbackToast(setToastMessage)
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
    }

    return () => {
      cancelled = true
      window.clearTimeout(metadataTimeoutTimer)
      window.clearTimeout(restFallbackTimer)
      restFallbackAbortController.abort()
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
      {toastMessage ? (
        <div className="fixed right-4 top-8 z-[230] border border-[color:rgba(255,168,64,0.48)] bg-[color:rgba(34,18,6,0.96)] px-3 py-2 font-hud text-[0.58rem] tracking-[0.14em] text-[color:rgba(255,224,186,0.96)] shadow-[0_0_16px_rgba(255,168,64,0.18)]">
          {toastMessage}
        </div>
      ) : null}
      {children}
    </>
  )
}
