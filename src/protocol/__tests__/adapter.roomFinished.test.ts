import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '../adapter'
import type { IncomingMessage } from '../types'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

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

describe('adapter room.finished routing', () => {
  beforeEach(() => {
    useGameStore.getState().initGame()
    gameStoreApi.setState({
      currentRoomId: 'room-1',
      roomStatus: 'running',
      winner: null,
      finalNarration: null,
    })
    useUIStore.setState({
      gameFinishedBanner: null,
      gameFinishedRedirectAtMs: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies room.finished to game and UI stores', () => {
    const transport = new FakeTransport()
    const dispose = attachAdapter(transport as unknown as Parameters<typeof attachAdapter>[0], gameStoreApi)

    transport.emit({
      v: 1,
      id: 'finished-1',
      t: 'room.finished',
      ts: 1,
      seq: 1,
      p: {
        room_id: 'room-1',
        winner: 'ironCrown',
        final_narration: '铁冠帝国完成最终统治。',
        replay_available: true,
      },
    })

    const gameState = useGameStore.getState()
    expect(gameState.roomStatus).toBe('finished')
    expect(gameState.winner).toBe('ironCrown')
    expect(gameState.finalNarration).toBe('铁冠帝国完成最终统治。')

    const uiState = useUIStore.getState()
    expect(uiState.gameFinishedBanner).toEqual({
      winner: 'ironCrown',
      finalNarration: '铁冠帝国完成最终统治。',
      replayAvailable: true,
    })
    expect(uiState.gameFinishedRedirectAtMs).toBeGreaterThan(Date.now())

    dispose()
  })
})
