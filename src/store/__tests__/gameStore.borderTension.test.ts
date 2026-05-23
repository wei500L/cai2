import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'

describe('gameStore _applyMapDiff border updates', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(42)
    useGameStore.setState({ borderTensionMap: {} })
  })

  it('writes sorted border tension keys and keeps region neighbors', () => {
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
            direction: 'inward',
            speed: 1.2,
            particles: 48,
          },
        },
      ],
      border_updates: [
        {
          between: ['starlight', 'ironCrown'],
          tension: 0.72,
          visual_state: 'war_frontline',
        },
      ],
    })

    const next = useGameStore.getState()
    const updated = next.regions.find((region) => region.id === target.id)

    expect(updated?.owner).toBe('starlight')
    expect(updated?.neighbors).toEqual(target.neighbors)
    expect(next.borderTensionMap['ironCrown:starlight']).toEqual({
      tension: 0.72,
      visual_state: 'war_frontline',
    })
  })
})
