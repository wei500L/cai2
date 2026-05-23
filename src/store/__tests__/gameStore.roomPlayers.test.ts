import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'

describe('gameStore room players', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(1)
    useGameStore.setState({
      selectedFactionId: null,
      currentRoomId: null,
      currentPlayerId: null,
      roomMode: null,
      roomStatus: null,
      roomPlayers: [],
      aiFactions: [],
      events: [],
      privateMessages: [],
    })
  })

  it('applies room snapshot without touching event streams', () => {
    const existingEvent = {
      id: 'event-1',
      createdAt: 1,
      epoch: 1,
      turn: 1,
      phase: 'action' as const,
      priority: 'P2' as const,
      kind: 'speech' as const,
      actor: 'ironCrown' as const,
      payload: {},
      narration: 'kept',
    }
    useGameStore.setState({ events: [existingEvent] })

    useGameStore.getState()._applyRoomSnapshot({
      room_id: 'room-1',
      mode: 'multi_4v4',
      status: 'lobby',
      ai_factions: ['emerald', 'ashen', 'aurora', 'darkTide'],
      players: [
        {
          player_id: 'p1',
          display_name: 'Alice',
          faction_id: 'ironCrown',
          connected: true,
          ready: false,
          ai_takeover: false,
        },
        {
          player_id: 'p2',
          display_name: 'Bob',
          faction_id: null,
          connected: true,
          ready: false,
          ai_takeover: false,
        },
      ],
    })

    const state = useGameStore.getState()
    expect(state.currentRoomId).toBe('room-1')
    expect(state.roomMode).toBe('multi_4v4')
    expect(state.roomPlayers).toHaveLength(2)
    expect(state.events).toEqual([existingEvent])
  })

  it('marks takeover and resume on the matching player only', () => {
    useGameStore.setState({
      currentRoomId: 'room-1',
      roomPlayers: [
        {
          player_id: 'p1',
          display_name: 'Alice',
          faction_id: 'ironCrown',
          connected: true,
          ready: true,
          ai_takeover: false,
        },
        {
          player_id: 'p2',
          display_name: 'Bob',
          faction_id: 'starlight',
          connected: true,
          ready: true,
          ai_takeover: false,
        },
      ],
    })

    useGameStore.getState()._applyPlayerTakeover({
      room_id: 'room-1',
      player_id: 'p2',
      faction_id: 'starlight',
      reason: 'disconnected_30s',
    })
    expect(useGameStore.getState().roomPlayers[1]).toMatchObject({
      connected: false,
      ai_takeover: true,
    })
    expect(useGameStore.getState().roomPlayers[0].ai_takeover).toBe(false)

    useGameStore.getState()._applyPlayerResume({
      room_id: 'room-1',
      player_id: 'p2',
      faction_id: 'starlight',
    })
    expect(useGameStore.getState().roomPlayers[1]).toMatchObject({
      connected: true,
      ai_takeover: false,
    })
  })

  it('optimistically updates current player faction selection', () => {
    useGameStore.setState({
      currentRoomId: 'room-1',
      currentPlayerId: 'p1',
      roomPlayers: [
        {
          player_id: 'p1',
          display_name: 'Alice',
          faction_id: null,
          connected: true,
          ready: true,
          ai_takeover: false,
        },
      ],
    })

    useGameStore.getState().selectFaction('ironCrown')

    expect(useGameStore.getState().selectedFactionId).toBe('ironCrown')
    expect(useGameStore.getState().roomPlayers[0]).toMatchObject({
      faction_id: 'ironCrown',
      ready: false,
    })
  })
})
