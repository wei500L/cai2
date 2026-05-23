import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '../adapter'
import type { IncomingMessage } from '../types'
import type { Transport } from '../transport'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

class FakeTransport {
  private handler: ((message: IncomingMessage) => void) | null = null
  requestReconnect = vi.fn()

  on(handler: (message: IncomingMessage) => void) {
    this.handler = handler
  }

  off(handler: (message: IncomingMessage) => void) {
    if (this.handler === handler) {
      this.handler = null
    }
  }

  emit(message: IncomingMessage) {
    this.handler?.(message)
  }
}

function resetStore() {
  useGameStore.getState().initGame()
  gameStoreApi.setState({
    events: [],
    privateMessages: [],
    roomStatus: 'running',
  })
  useUIStore.setState({
    lastSyncAt: 0,
    connectionFailureReason: null,
  })
}

function makeBroadcastEnvelope(seq: number): IncomingMessage {
  return {
    v: 1,
    id: `msg-${seq}`,
    t: 'action.broadcast',
    ts: seq,
    seq,
    p: {
      room_id: 'room-1',
      event: {
        id: `event-${seq}`,
        seq,
        createdAt: seq,
        epoch: 1,
        turn: 1,
        phase: 'action',
        priority: 'P2',
        kind: 'speech',
        actor: 'ironCrown',
        target: 'starlight',
        payload: {},
        narration: `event ${seq}`,
      },
    },
  }
}

describe('adapter reconnect catchup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sorts catchup envelopes by seq before applying them', () => {
    const transport = new FakeTransport()
    attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit({
      v: 1,
      id: 'catchup-1',
      t: 'reconnect.catchup',
      ts: 1,
      seq: 3,
      p: {
        room_id: 'room-1',
        from_seq: 0,
        to_seq: 3,
        server_time_ms: 1_500,
        messages: [makeBroadcastEnvelope(3), makeBroadcastEnvelope(1), makeBroadcastEnvelope(2)],
      },
    })

    expect(useGameStore.getState().events.map((event) => event.seq)).toEqual([3, 2, 1])
    expect(transport.requestReconnect).not.toHaveBeenCalled()
    expect(useUIStore.getState().connectionFailureReason).toBeNull()
  })

  it('requests snapshot fallback when catchup seq continuity is broken', () => {
    const transport = new FakeTransport()
    attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit({
      v: 1,
      id: 'catchup-2',
      t: 'reconnect.catchup',
      ts: 1,
      seq: 3,
      p: {
        room_id: 'room-1',
        from_seq: 0,
        to_seq: 3,
        server_time_ms: 1_500,
        messages: [makeBroadcastEnvelope(1), makeBroadcastEnvelope(3)],
      },
    })

    expect(useGameStore.getState().events).toEqual([])
    expect(transport.requestReconnect).toHaveBeenCalledTimes(1)
    expect(useUIStore.getState().connectionFailureReason).toBe('catchup gap')
  })
})
