import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'
import { useMapStore } from '../mapStore'

describe('gameStore scorch wiring', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(42)
    useMapStore.setState({
      cinematicEnabled: true,
      reducedMotion: false,
      scorchedRegions: new Map(),
      explosionQueue: [],
    })
  })

  it('advances scorch lifecycle when turn.begin is applied', () => {
    useMapStore.getState().applyScorchedDiff({
      room_id: 'room-1',
      epoch: 1,
      turn: 6,
      changes: [
        {
          hex_id: 'hex-a',
          scorched_turns_remaining: 3,
          fallout: 0.2,
          scorched_since_turn: 6,
        },
      ],
    })

    useGameStore.getState()._applyTurnBegin({
      room_id: 'room-1',
      epoch: 1,
      turn: 9,
      phase: 'observe',
      arbitrate_phase: null,
      phase_started_at_ms: 1_000,
      phase_duration_ms: 10_000,
      server_time_ms: 1_000,
      visible_snapshot: {
        epoch: {
          id: 1,
          turn: 9,
          phase: 'observe',
          phaseStartedAt: 1_000,
          phaseDurationMs: 10_000,
        },
        regions: [],
        factions: [],
        relationships: [],
      },
    })

    expect(useMapStore.getState().scorchedRegions.has('hex-a')).toBe(false)
  })
})
