import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import type { GameStoreState } from '@/store/gameStore'
import { factionMetaStore } from '@/store/factionMetaStore'
import { ActionDispatcher, dispatchEpochNarrationMessage } from './dispatcher'
import type { IncomingMessage } from './types'
import type { Transport } from './transport'

type GameStoreApiLike = {
  getState: () => GameStoreState
}

const RECONNECT_CATCHUP_MAX = 50

function sortBySeq<T extends { seq: number }>(items: T[]) {
  return [...items].sort((left, right) => left.seq - right.seq)
}

export function attachAdapter(transport: Transport, gameStore: GameStoreApiLike) {
  const handleMessage = (message: IncomingMessage) => {
    const store = gameStore.getState()

    switch (message.t) {
      case 'conn.auth.ok':
        store._applyServerClockSample(message.p.server_time_ms, Date.now())
        break
      case 'conn.pong':
        store._applyServerClockSample(message.p.server_time_ms ?? message.p.server_ts ?? Date.now(), Date.now())
        break
      case 'phase.change':
        store._applyPhase(message.p)
        break
      case 'turn.begin':
        store._applyTurnBegin(message.p)
        break
      case 'turn.end':
        break
      case 'room.joined':
        store._applyRoomJoined(message.p.room_snapshot)
        break
      case 'room.created':
        store._applyRoomCreated(message.p)
        break
      case 'room.snapshot':
        store.applySnapshot(message.p)
        break
      case 'room.started':
      case 'room.start':
        store.applyRoomStarted(message.p)
        break
      case 'game.opening':
        store._applyOpeningContent(message.p)
        break
      case 'room.factions_meta':
        factionMetaStore.getState().applyFactionsMeta(message.p)
        break
      case 'room.finished':
        store._applyRoomFinished(message.p)
        useUIStore.getState().setGameFinishedBanner({
          winner: message.p.winner,
          finalNarration: message.p.final_narration,
          replayAvailable: message.p.replay_available,
        })
        break
      case 'room.player_takeover':
        store._applyPlayerTakeover(message.p)
        break
      case 'room.player_resume':
        store._applyPlayerResume(message.p)
        break
      case 'resolve.diplomatic_arcs':
        store._applyDiplomaticArcs(message.p)
        break
      case 'resolve.ripple':
        store._applyRipples(message.p)
        break
      case 'resolve.event.explosion':
        store.handleExplosion(message.p)
        break
      case 'resolve.scorched_diff':
        store.applyScorchedDiff(message.p)
        break
      case 'resolve.events':
        store._applyEvents(message.p)
        break
      case 'resolve.map_diff':
        store._applyMapDiff(message.p)
        break
      case 'resolve.stats_diff':
        store._applyStatsDiff(message.p)
        break
      case 'resolve.world_lighting':
        useMapStore.getState().setSunPosition(message.p.sun_lat, message.p.sun_lng)
        break
      case 'arbitrate.epic_narration':
      case 'arbitrate.summary_narration':
        dispatchEpochNarrationMessage(message)
        break
      case 'ai.thinking':
        ActionDispatcher.applyAIThinking(message)
        break
      case 'action.broadcast':
      case 'action.private': {
        const privateMessage =
          'private_message' in message.p ? message.p.private_message : undefined
        const event = sanitizeRuntimeEvent(message, store.roomStatus)
        store._applyEvents({
          room_id: message.p.room_id,
          events: [event],
          private_messages: privateMessage ? [privateMessage] : undefined,
        })
        break
      }
      case 'ai.speak':
        ActionDispatcher.applyAISpeak({
          ...message,
          p: {
            ...message.p,
            event: sanitizeRuntimeEvent(message, store.roomStatus),
          },
        })
        break
      case 'ai.reaction':
        ActionDispatcher.applyAIReaction({
          ...message,
          p: {
            ...message.p,
            event: sanitizeRuntimeEvent(message, store.roomStatus),
          },
        })
        break
      case 'replay.ai_diary_reveal':
        store._applyAIDiaries(message.p)
        break
      case 'action.rejected':
        useUIStore.getState().setLastError(message.p.reason)
        break
      case 'error.message':
        useUIStore.getState().setLastError(message.p.reason)
        break
      case 'reconnect.catchup':
        {
          store._applyServerClockSample(message.p.server_time_ms, Date.now())
          const ordered = sortBySeq(message.p.messages as Array<{ seq: number } & Record<string, unknown>>)
          const expectedFirst = message.p.from_seq + 1
          const expectedLast = message.p.to_seq
          const expectedLength = expectedLast - expectedFirst + 1
          const hasGap =
            ordered.length !== expectedLength ||
            ordered.some((entry, index) => entry.seq !== expectedFirst + index) ||
            message.p.messages.length > RECONNECT_CATCHUP_MAX

          if (hasGap) {
            console.warn('reconnect.catchup seq gap detected; requesting snapshot fallback')
            useUIStore.getState().setConnectionFailureReason('catchup gap')
            transport.requestReconnect?.()
            break
          }

          for (const entry of ordered) {
            handleMessage(entry as IncomingMessage)
          }

          useUIStore.getState().setLastSyncAt(Date.now())
          useUIStore.getState().setConnectionFailureReason(null)
        }
        break
      case 'room.world_geometry':
        store.applyWorldGeometry(message.p)
        break
      case 'reconnect.snapshot':
        store.applySnapshot(message.p)
        break
      default:
        console.warn('[ws] unhandled message type:', (message as { t: string }).t)
        break
    }
  }

  transport.on(handleMessage)

  return () => {
    transport.off(handleMessage)
  }
}

function sanitizeRuntimeEvent(
  message: Extract<IncomingMessage, { t: 'action.broadcast' | 'action.private' | 'ai.speak' | 'ai.reaction' }>,
  roomStatus: string | null,
) {
  const event = message.p.event
  const payload = event.payload
  if (!payload || typeof payload !== 'object' || !('internal_thought' in payload)) {
    return event
  }

  if (roomStatus !== 'finished' && import.meta.env.DEV) {
    console.warn('可疑泄漏字段 internal_thought 已被剥离', {
      messageType: message.t,
      roomId: message.p.room_id,
    })
  }

  const nextPayload = { ...payload }
  delete (nextPayload as { internal_thought?: unknown }).internal_thought

  return {
    ...event,
    payload: nextPayload,
  }
}
