import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'

describe('gameStore region change application', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(42)
  })

  it('updates owner and appends transition log entries', () => {
    const state = useGameStore.getState()
    const target = state.regions[0]

    state._applyMapDiff({
      changes: [
        {
          region_id: target.id,
          prev_owner: target.owner,
          new_owner: 'starlight',
          transition: 'conquest',
          animation_params: {
            direction: 'west_to_east',
            speed: 1.2,
            particles: 'aggressive',
          },
        },
      ],
      border_updates: [],
    })

    const next = useGameStore.getState()
    const updated = next.regions.find((region) => region.id === target.id)

    expect(updated?.owner).toBe('starlight')
    expect(updated?.developmentLevel).toBe(0.3)
    expect(updated?.resistance).toBe(0.5)
    expect(updated?.capturedAtTurn).toBe(next.epoch.turn)
    expect(next.regionTransitionLog).toHaveLength(1)
    expect(next.regionTransitionLog[0]).toMatchObject({
      region_id: target.id,
      new_owner: 'starlight',
      transition: 'conquest',
    })
  })
})
