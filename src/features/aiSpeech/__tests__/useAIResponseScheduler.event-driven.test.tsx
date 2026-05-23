/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '@/protocol/adapter'
import type { IncomingMessage } from '@/protocol/types'
import type { Transport } from '@/protocol/transport'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { useAIResponseScheduler } from '../useAIResponseScheduler'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

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

function SchedulerProbe({ onRender }: { onRender: () => void }) {
  useAIResponseScheduler()
  onRender()
  return null
}

describe('useAIResponseScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    useGameStore.getState().initGame(1)
    const epoch = useGameStore.getState().epoch

    gameStoreApi.setState({
      selectedFactionId: 'starlight',
      currentRoomId: 'room-1',
      roomStatus: 'running',
      epoch: {
        ...epoch,
        phase: 'action',
        phaseStartedAt: 1_000,
        phaseDurationMs: 90_000,
      },
      currentTurn: {
        ...epoch,
        phase: 'action',
        phaseStartedAt: 1_000,
        phaseDurationMs: 90_000,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('reacts to store-driven AI events without scheduling timers', () => {
    const transport = new FakeTransport()
    const dispose = attachAdapter(transport as unknown as Transport, gameStoreApi)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    let renderCount = 0

    act(() => {
      root.render(<SchedulerProbe onRender={() => (renderCount += 1)} />)
    })

    setTimeoutSpy.mockClear()

    act(() => {
      transport.emit({
        v: 1,
        id: 'ai-thinking-1',
        t: 'ai.thinking',
        ts: 1_000,
        seq: 1,
        p: {
          room_id: 'room-1',
          faction_id: 'darkTide',
          progress: 0.42,
        },
      })
    })

    expect(renderCount).toBe(2)
    expect(useGameStore.getState().lastAIThinking).toMatchObject({
      factionId: 'darkTide',
      progress: 0.42,
      phase: 'action',
      fallback: false,
    })
    expect(setTimeoutSpy).not.toHaveBeenCalled()

    act(() => {
      transport.emit({
        v: 1,
        id: 'ai-speak-1',
        t: 'ai.speak',
        ts: 1_001,
        seq: 2,
        p: {
          room_id: 'room-1',
          event: {
            id: 'ai-speech-1',
            createdAt: 1_001,
            epoch: 1,
            turn: 1,
            phase: 'action',
            priority: 'P2',
            kind: 'speech',
            actor: 'darkTide',
            target: 'starlight',
            payload: {
              aiGenerated: true,
              sourceEventId: 'player-event-1',
              channel: 'public',
              stance: 'pragmatic',
              text: '公开发言',
            },
            narration: '公开发言',
          },
        },
      })
    })

    expect(renderCount).toBe(3)
    expect(useGameStore.getState().aiSpeakQueue[0]).toMatchObject({
      id: 'ai-speech-1',
      kind: 'public',
      text: '公开发言',
      sourceEventId: 'player-event-1',
    })
    expect(useGameStore.getState().lastAISpeak).toMatchObject({
      id: 'ai-speech-1',
      kind: 'public',
    })
    expect(setTimeoutSpy).not.toHaveBeenCalled()

    act(() => {
      root.unmount()
    })

    dispose()
    container.remove()
  })
})
