import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'
import type { WorldGeometryPayload } from '@/protocol/types'

describe('gameStore applyWorldGeometry', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(42)
  })

  it('writes geometry state and keeps it intact across map diffs', () => {
    const payload: WorldGeometryPayload = {
      seed: 7,
      hex_resolution: 4,
      total_cells: 2,
      factions: [
        {
          id: 'starlight',
          capital_hex_id: 'hex_a',
          capital_lat: 10,
          capital_lng: 20,
        },
        {
          id: 'emerald',
          capital_hex_id: 'hex_b',
          capital_lat: -10,
          capital_lng: -20,
        },
      ],
      cells: [
        {
          id: 'hex_a',
          owner: 'starlight',
          resourceValue: 44,
          developmentLevel: 3,
          elevation: 0.42,
          resistance: 0.1,
          capturedAtTurn: null,
          centerLatLng: [10, 20],
          lat: 10,
          lng: 20,
          hex_id: 'hex_a',
          terrain: 'plains',
          minGarrison: 10,
          supplyLines: 2,
          neighbors: ['hex_b'],
        },
        {
          id: 'hex_b',
          owner: 'emerald',
          resourceValue: 52,
          developmentLevel: 4,
          elevation: 0.63,
          resistance: 0.2,
          capturedAtTurn: null,
          centerLatLng: [-10, -20],
          lat: -10,
          lng: -20,
          hex_id: 'hex_b',
          terrain: 'mountain',
          minGarrison: 14,
          supplyLines: 3,
          neighbors: ['hex_a'],
        },
      ],
    }

    const state = useGameStore.getState()
    state.applyWorldGeometry(payload)

    const next = useGameStore.getState()
    expect(next.worldGeometry).toMatchObject({
      seed: 7,
      hex_resolution: 4,
      total_cells: 2,
      capitals: payload.factions,
    })
    expect(next.regions).toHaveLength(2)
    expect(next.regions[0]).toMatchObject({
      id: 'hex_a',
      lat: 10,
      lng: 20,
      hex_id: 'hex_a',
      elevation: 0.42,
    })

    next._applyMapDiff({
      changes: [
        {
          region_id: 'hex_a',
          prev_owner: 'starlight',
          new_owner: 'magma',
          transition: 'conquest',
          animation_params: {
            direction: 'west_to_east',
            speed: 1.1,
            particles: 'aggressive',
          },
        },
      ],
      border_updates: [],
    })

    const afterDiff = useGameStore.getState()
    expect(afterDiff.worldGeometry).toMatchObject({
      seed: 7,
      hex_resolution: 4,
      total_cells: 2,
    })
    expect(afterDiff.regions).toHaveLength(2)
    expect(afterDiff.regions.find((region) => region.id === 'hex_a')).toMatchObject({
      owner: 'magma',
      hex_id: 'hex_a',
      elevation: 0.42,
    })
  })
})
