import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameStoreApi, useGameStore } from '../gameStore'
import { useUIStore } from '../uiStore'
import type { ReconnectFullState } from '@/protocol/types'

describe('gameStore reconnect snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    useGameStore.getState().initGame(1)
    gameStoreApi.setState({
      selectedFactionId: 'ironCrown',
      serverClockOffsetMs: -999,
      serverClockSampleAtMs: 0,
      events: [],
      privateMessages: [],
    })
    useUIStore.setState({
      leftPanelOpen: false,
      mapQuality: 'high',
    })
    useUIStore.setState({
      lastSyncAt: 0,
      connectionFailureReason: 'stale',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the full game state without touching ui layout state', () => {
    const snapshot: ReconnectFullState = {
      room: {
        id: 'room-9',
        status: 'running',
        mode: 'multi_4v4',
        max_players: 4,
        players: [
          {
            id: 'player-1',
            display_name: 'Alice',
            faction_id: 'ironCrown',
            connected: true,
            ready: false,
            ai_takeover: false,
          },
        ],
        ai_factions: ['aurora', 'darkTide'],
        current_player_id: 'player-1',
      },
      current_turn: {
        epoch: 3,
        turn: 2,
        phase: 'resolve',
        arbitrate_phase: null,
        phase_started_at_ms: 1_800,
        phase_duration_ms: 30_000,
      },
      factions: [
        {
          id: 'ironCrown',
          military: 88,
          economy: 62,
          diplomacy: 38,
          culture: 46,
          morale: 74,
          totalPower: 308,
          status: 'stable',
        },
      ],
      regions: [
        {
          id: 'region-1',
          owner: 'ironCrown',
          resourceValue: 24,
          developmentLevel: 3,
          resistance: 0.5,
          capturedAtTurn: 2,
          centerLatLng: [12, 34],
          terrain: 'plains',
          minGarrison: 10,
          supplyLines: 2,
          neighbors: ['region-2'],
        },
      ],
      relationships: [
        {
          from: 'ironCrown',
          to: 'starlight',
          value: -80,
          status: 'hostile',
          treaties: ['non_aggression'],
        },
      ],
      treaties: [
        {
          id: 'treaty-1',
          kind: 'trade',
          parties: ['ironCrown', 'starlight'],
          started_epoch: 2,
          started_turn: 1,
          ends_epoch: null,
          ends_turn: null,
          active: true,
          metadata: {},
        },
      ],
      recent_events: [
        {
          id: 'event-1',
          seq: 11,
          createdAt: 1_010,
          epoch: 3,
          turn: 2,
          phase: 'resolve',
          priority: 'P2',
          kind: 'speech',
          actor: 'ironCrown',
          target: 'starlight',
          payload: { order: 1 },
          narration: 'older',
        },
        {
          id: 'event-2',
          seq: 12,
          createdAt: 1_020,
          epoch: 3,
          turn: 2,
          phase: 'resolve',
          priority: 'P2',
          kind: 'narration',
          actor: 'starlight',
          payload: { order: 2 },
          narration: 'middle',
        },
        {
          id: 'event-1',
          seq: 13,
          createdAt: 1_030,
          epoch: 3,
          turn: 2,
          phase: 'resolve',
          priority: 'P2',
          kind: 'speech',
          actor: 'ironCrown',
          target: 'starlight',
          payload: { order: 3 },
          narration: 'newer',
        },
      ],
      recent_messages: [
        {
          id: 'msg-public',
          room_id: 'room-9',
          epoch: 3,
          turn: 2,
          phase: 'resolve',
          from_faction: 'ironCrown',
          to_factions: ['starlight'],
          visibility: { scope: 'public', faction_ids: [] },
          content: 'public',
          created_at_ms: 1_040,
          kind: 'public',
        },
        {
          id: 'msg-private',
          room_id: 'room-9',
          epoch: 3,
          turn: 2,
          phase: 'resolve',
          from_faction: 'ironCrown',
          to_factions: ['starlight'],
          visibility: { scope: 'private', faction_ids: ['starlight'] },
          content: 'private',
          created_at_ms: 1_050,
          kind: 'private',
        },
      ],
      ai_thinking_state: {
        progress: 0.75,
        phase: 'deliberation',
        model: 'mock-1',
        elapsed_ms: 4_200,
      },
      border_tension: [
        {
          between: ['ironCrown', 'starlight'],
          tension: 90,
          visual_state: 'critical',
        },
      ],
      winner: 'ironCrown',
      final_narration: '局势已定。',
    }

    useGameStore.getState()._applySnapshot({
      room_id: 'room-9',
      server_time_ms: 4_500,
      full_state: snapshot,
      seq: 99,
    })

    const state = useGameStore.getState()
    expect(state.currentRoomId).toBe('room-9')
    expect(state.currentTurn).toMatchObject({
      id: 3,
      turn: 2,
      phase: 'resolve',
    })
    expect(state.factions).toEqual(snapshot.factions)
    expect(state.regions[0].neighbors).toEqual(['region-2'])
    expect(state.relationships).toEqual(snapshot.relationships)
    expect(state.treaties).toEqual(snapshot.treaties)
    expect(state.events).toHaveLength(2)
    expect(state.events[0]).toMatchObject({ id: 'event-1', seq: 13, narration: 'newer' })
    expect(state.events[1]).toMatchObject({ id: 'event-2', seq: 12, narration: 'middle' })
    expect(state.privateMessages).toHaveLength(1)
    expect(state.privateMessages[0]).toMatchObject({ id: 'msg-private', body: 'private' })
    expect(state.aiThinkingState).toEqual({
      progress: 0.75,
      phase: 'deliberation',
      model: 'mock-1',
      elapsed_ms: 4_200,
      fallback: false,
    })
    expect(state.borderTensionMap['ironCrown:starlight']).toEqual({
      tension: 90,
      visual_state: 'critical',
    })
    expect(state.winner).toBe('ironCrown')
    expect(state.finalNarration).toBe('局势已定。')
    expect(state.selectedFactionId).toBe('ironCrown')
    expect(useUIStore.getState().lastSyncAt).toBe(2_000)
    expect(useUIStore.getState().connectionFailureReason).toBeNull()
    expect(useUIStore.getState().leftPanelOpen).toBe(false)
    expect(useUIStore.getState().mapQuality).toBe('high')
    expect(useGameStore.getState().serverClockOffsetMs).toBe(2_500)
    expect(useGameStore.getState().serverClockSampleAtMs).toBe(2_000)
  })
})
