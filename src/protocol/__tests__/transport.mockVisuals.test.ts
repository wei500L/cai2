import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachAdapter } from '../adapter'
import { MockTransport } from '../transport'
import type { OutgoingMessage } from '../types'
import { epochSummaryStore } from '@/store/epochSummaryStore'
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

function makePrivateMessage(id: string): OutgoingMessage {
  return {
    v: 1,
    id,
    t: 'action.private',
    ts: Date.now(),
    seq: 1,
    p: {
      room_id: 'mock-room',
      target_faction: 'starlight',
      content: '这是一段密谈内容。',
      metadata: {
        player_faction: 'emerald',
      },
    },
  }
}

describe('MockTransport diplomatic visuals', () => {
  let transport: MockTransport | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    useGameStore.getState().initGame(42)
    gameStoreApi.setState({
      diplomaticArcs: [],
      ripples: [],
      epoch: {
        ...useGameStore.getState().epoch,
        phase: 'action',
        phaseStartedAt: 1_000,
        phaseDurationMs: 90_000,
      },
    })
  })

  afterEach(() => {
    transport?.disconnect()
    transport = null
    epochSummaryStore.getState().reset()
    vi.useRealTimers()
  })

  it('emits seven dashed arcs and one ripple for a speech', () => {
    transport = new MockTransport()
    attachAdapter(transport, gameStoreApi)
    transport.connect()

    const state = useGameStore.getState()
    state._applyPhase({
      room_id: 'mock-room',
      epoch: 1,
      turn: 1,
      phase: 'action',
      phase_started_at_ms: 1_000,
      phase_duration_ms: 90_000,
      server_time_ms: 1_000,
    })

    transport.send(makeSpeechMessage('speech-1'))

    expect(useGameStore.getState().diplomaticArcs).toHaveLength(7)
    expect(useGameStore.getState().ripples).toHaveLength(1)
  })

  it('emits one arc for a private message', () => {
    transport = new MockTransport()
    attachAdapter(transport, gameStoreApi)
    transport.connect()

    const state = useGameStore.getState()
    state._applyPhase({
      room_id: 'mock-room',
      epoch: 1,
      turn: 1,
      phase: 'action',
      phase_started_at_ms: 1_000,
      phase_duration_ms: 90_000,
      server_time_ms: 1_000,
    })

    transport.send(makePrivateMessage('private-1'))

    expect(useGameStore.getState().diplomaticArcs).toHaveLength(1)
    expect(useGameStore.getState().ripples).toHaveLength(0)
  })

  it('applies room.create in lobby mode', () => {
    transport = new MockTransport({ lobbyMode: true })
    attachAdapter(transport, gameStoreApi)
    transport.connect()

    transport.send({
      v: 1,
      id: 'create-1',
      t: 'room.create',
      ts: Date.now(),
      seq: 1,
      p: {
        mode: 'multi_4v4',
        display_name: 'Host',
      },
    })

    const state = useGameStore.getState()
    expect(state.currentRoomId).toMatch(/^mock-room-/)
    expect(state.roomStatus).toBe('lobby')
    expect(state.roomPlayers).toHaveLength(1)
  })

  it('emits epic and summary narration payloads during arbitrate phase advances', () => {
    transport = new MockTransport()
    attachAdapter(transport, gameStoreApi)
    transport.connect()

    const epochId = useGameStore.getState().epoch.id
    useGameStore.getState()._applyPhase({
      room_id: 'mock-room',
      epoch: epochId,
      turn: 1,
      phase: 'arbitrate',
      arbitrate_phase: 'battle',
      phase_started_at_ms: 1_000,
      phase_duration_ms: 90_000,
      server_time_ms: 1_000,
    })

    transport.advancePhase()
    transport.advancePhase()

    const entry = epochSummaryStore.getState().byEpoch.get(epochId)
    expect(entry?.epic?.source).toBe('template_fallback')
    expect(entry?.epic?.narrative).toContain('纪元')
    expect(entry?.summary?.source).toBe('template_fallback')
    expect(entry?.summary?.highlights.majorEvents.length).toBeGreaterThanOrEqual(0)
  })
})
