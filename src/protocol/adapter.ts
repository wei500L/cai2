import { useUIStore } from '@/store/uiStore'
import type { GameStoreState } from '@/store/gameStore'
import type { IncomingMessage } from './types'
import type { Transport } from './transport'

type GameStoreApiLike = {
  getState: () => GameStoreState
}

export function attachAdapter(transport: Transport, gameStore: GameStoreApiLike) {
  const handleMessage = (message: IncomingMessage) => {
    const store = gameStore.getState()

    switch (message.t) {
      case 'phase.change':
        store._applyPhase(message.p)
        break
      case 'turn.begin':
        store._applyPhase({
          id: message.p.epoch,
          turn: message.p.turn,
          phase: store.epoch.phase,
          arbitratePhase: store.epoch.arbitratePhase,
          phaseStartedAt: store.epoch.phaseStartedAt,
          phaseDurationMs: store.epoch.phaseDurationMs,
        })
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
      case 'action.broadcast':
      case 'action.private':
      case 'ai.speak':
        store._applyEvents({
          room_id: message.p.room_id,
          events: [message.p.event],
          private_messages: message.p.private_message ? [message.p.private_message] : undefined,
        })
        break
      case 'ai.reaction':
        store._applyEvents({
          room_id: message.p.room_id,
          events: [message.p.event],
        })
        break
      case 'action.rejected':
        useUIStore.getState().setLastError(message.p.reason)
        break
      case 'room.start':
      case 'reconnect.snapshot':
        break
      default:
        break
    }
  }

  transport.on(handleMessage)

  return () => {
    transport.off(handleMessage)
  }
}
