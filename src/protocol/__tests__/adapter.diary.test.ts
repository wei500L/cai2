import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '../adapter'
import type { IncomingMessage } from '../types'
import type { Transport } from '../transport'
import type { DiaryEntry } from '../types'
import type { FactionId } from '@/types/faction'
import { gameStoreApi, useGameStore } from '@/store/gameStore'

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

function resetStore() {
  gameStoreApi.setState({
    roomStatus: 'running',
    aiDiaries: {} as Record<FactionId, DiaryEntry[]>,
  })
}

describe('adapter diary routing', () => {
  beforeEach(() => {
    useGameStore.getState().initGame()
    resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies replay.ai_diary_reveal into the store', () => {
    const transport = new FakeTransport()
    const dispose = attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit({
      v: 1,
      id: 'msg-1',
      t: 'replay.ai_diary_reveal',
      ts: 1,
      seq: 1,
      p: {
        room_id: 'room-1',
        faction_id: 'ironCrown',
        entries: [
          {
            faction_id: 'ironCrown',
            epoch: 2,
            turn: 3,
            internal_thought: '先稳住局面。',
            emotion: 'tense',
            triggers: ['battle-1'],
            created_at_ms: 100,
          },
        ],
      },
    })

    const state = useGameStore.getState()
    expect(state.aiDiaries.ironCrown?.[0]?.internal_thought).toBe('先稳住局面。')
    expect(state.hasDiariesRevealed()).toBe(true)

    dispose()
  })

  it('strips suspicious internal_thought from runtime ai.speak events', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const transport = new FakeTransport()
    attachAdapter(transport as unknown as Transport, gameStoreApi)

    transport.emit({
      v: 1,
      id: 'msg-2',
      t: 'ai.speak',
      ts: 1,
      seq: 2,
        p: {
          room_id: 'room-1',
          event: {
            id: 'event-1',
            epoch: 2,
            turn: 3,
            phase: 'resolve',
          createdAt: 100,
          priority: 'P1',
          kind: 'speech',
          actor: 'ironCrown',
          target: 'starlight',
          payload: {
            content: '公开发言',
            internal_thought: '不该出现在运行期。',
          },
          narration: '公开发言',
        },
      },
    })

    const event = useGameStore.getState().events[0]
    expect(event.payload).not.toHaveProperty('internal_thought')
    expect(warn).toHaveBeenCalledWith(
      '可疑泄漏字段 internal_thought 已被剥离',
      expect.objectContaining({
        messageType: 'ai.speak',
        roomId: 'room-1',
      }),
    )
  })
})
