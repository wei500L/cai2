/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '@/protocol/adapter'
import { MockTransport } from '@/protocol/transport'
import type { IncomingMessage, OutgoingMessage } from '@/protocol/types'
import { gameStoreApi, useGameStore } from '@/store/gameStore'

function makeSpeechMessage(id: string): OutgoingMessage {
  return {
    v: 1,
    id,
    t: 'action.speak',
    ts: Date.now(),
    seq: 1,
    p: {
      room_id: 'mock-room',
      mode: 'speech',
      content: '各位势力请注意，今天的演讲开始。',
      targets: [],
      metadata: {
        player_faction: 'starlight',
      },
    },
  }
}

describe('MockTransport AI response loop', () => {
  let transport: MockTransport | null = null
  let detachAdapter: (() => void) | null = null
  let messages: IncomingMessage[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    useGameStore.getState().initGame(42)

    transport = new MockTransport()
    messages = []
    detachAdapter = attachAdapter(transport, gameStoreApi)
    transport.on((message) => {
      messages.push(message)
    })
    transport.connect()
    messages = []

    const currentEpoch = useGameStore.getState().epoch
    gameStoreApi.setState({
      selectedFactionId: 'starlight',
      currentRoomId: 'mock-room',
      roomStatus: 'running',
      epoch: {
        ...currentEpoch,
        phase: 'action',
        phaseStartedAt: 1_000,
        phaseDurationMs: 90_000,
      },
      currentTurn: {
        ...currentEpoch,
        phase: 'action',
        phaseStartedAt: 1_000,
        phaseDurationMs: 90_000,
      },
    })
  })

  afterEach(() => {
    detachAdapter?.()
    detachAdapter = null
    transport?.disconnect()
    transport = null
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('emits thinking, then speech, then reaction for a client speech action', () => {
    const result = transport?.send(makeSpeechMessage('speech-1'))

    expect(result).toMatchObject({
      ok: true,
      eventId: expect.any(String),
    })

    const aiMessages = () => messages.filter((message) => message.t.startsWith('ai.'))

    expect(aiMessages()[0]?.t).toBe('ai.thinking')
    expect(aiMessages().some((message) => message.t === 'ai.speak')).toBe(false)

    vi.advanceTimersByTime(1_199)
    expect(aiMessages().some((message) => message.t === 'ai.speak')).toBe(false)

    vi.advanceTimersByTime(1)
    const speakMessage = aiMessages().find((message) => message.t === 'ai.speak')
    expect(speakMessage?.p.event.kind).toBe('speech')
    expect(speakMessage?.p.event.payload).toMatchObject({
      aiGenerated: true,
      sourceEventId: result?.eventId,
    })

    vi.advanceTimersByTime(360)
    const reactionMessage = aiMessages().find((message) => message.t === 'ai.reaction')
    expect(reactionMessage?.p.event.kind).toBe('ai_reaction')
    expect(reactionMessage?.p.event.payload).toMatchObject({
      aiGenerated: true,
      sourceEventId: result?.eventId,
    })

    const aiTypes = aiMessages().map((message) => message.t)
    expect(aiTypes.indexOf('ai.thinking')).toBeGreaterThanOrEqual(0)
    expect(aiTypes.indexOf('ai.speak')).toBeGreaterThan(aiTypes.indexOf('ai.thinking'))
    expect(aiTypes.indexOf('ai.reaction')).toBeGreaterThan(aiTypes.indexOf('ai.speak'))
  })
})
