import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '@/protocol/adapter'
import type { IncomingMessage } from '@/protocol/types'
import type { Transport } from '@/protocol/transport'
import { gameStoreApi, useGameStore } from '../gameStore'

class FakeTransport {
  private handler: ((message: IncomingMessage) => void) | null = null

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

function makeArc(index: number, ttlMs = 500): IncomingMessage {
  return {
    v: 1,
    id: `arc-${index}`,
    t: 'resolve.diplomatic_arcs',
    ts: index,
    seq: index,
    p: {
      room_id: 'room-1',
      arcs: [
        {
          id: `diplomatic-arc-${index}`,
          kind: index % 2 === 0 ? 'speech' : 'private',
          source_faction_id: 'starlight',
          target_faction_id: 'emerald',
          start_lat: 10,
          start_lng: 20,
          end_lat: -10,
          end_lng: -20,
          color: ['#33aaff', '#33ff77'],
          ttl_ms: ttlMs,
          created_at_ms: 1_000,
        },
      ],
    },
  }
}

describe('gameStore diplomatic visuals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    useGameStore.getState().initGame(42)
    useGameStore.setState({
      diplomaticArcs: [],
      ripples: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies resolve.diplomatic_arcs and resolve.ripple payloads and expires them', () => {
    const transport = new FakeTransport()
    attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit(makeArc(1, 500))
    transport.emit({
      v: 1,
      id: 'ripple-1',
      t: 'resolve.ripple',
      ts: 1,
      seq: 2,
      p: {
        room_id: 'room-1',
        ripples: [
          {
            id: 'ripple-1',
            lat: 10,
            lng: 20,
            max_radius: 4.2,
            ttl_ms: 750,
            color: '#33aaff',
            created_at_ms: 1_000,
          },
        ],
      },
    })

    expect(useGameStore.getState().diplomaticArcs).toHaveLength(1)
    expect(useGameStore.getState().ripples).toHaveLength(1)

    vi.advanceTimersByTime(499)
    expect(useGameStore.getState().diplomaticArcs).toHaveLength(1)
    expect(useGameStore.getState().ripples).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useGameStore.getState().diplomaticArcs).toHaveLength(0)
    expect(useGameStore.getState().ripples).toHaveLength(1)

    vi.advanceTimersByTime(250)
    expect(useGameStore.getState().ripples).toHaveLength(0)
  })

  it('keeps at most 24 active arcs', () => {
    const transport = new FakeTransport()
    attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit({
      v: 1,
      id: 'arc-batch',
      t: 'resolve.diplomatic_arcs',
      ts: 1,
      seq: 1,
      p: {
        room_id: 'room-1',
        arcs: Array.from({ length: 25 }, (_, index) => ({
          id: `diplomatic-arc-${index}`,
          kind: 'speech' as const,
          source_faction_id: 'starlight' as const,
          target_faction_id: 'emerald' as const,
          start_lat: 10,
          start_lng: 20,
          end_lat: -10,
          end_lng: -20,
          color: ['#33aaff', '#33ff77'] as [string, string],
          ttl_ms: 500,
          created_at_ms: 1_000,
        })),
      },
    })

    expect(useGameStore.getState().diplomaticArcs).toHaveLength(24)
  })
})
