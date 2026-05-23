import { beforeEach, describe, expect, it } from 'vitest'
import { useMapStore } from '../mapStore'

describe('mapStore scorch lifecycle', () => {
  beforeEach(() => {
    useMapStore.setState({
      cinematicEnabled: true,
      reducedMotion: false,
      scorchedRegions: new Map(),
      explosionQueue: [],
    })
  })

  it('merges scorch diffs into keyed entries', () => {
    useMapStore.getState().applyScorchedDiff({
      room_id: 'room-1',
      epoch: 1,
      turn: 6,
      changes: [
        {
          hex_id: 'hex-a',
          scorched_turns_remaining: 3,
          fallout: 0.6,
          scorched_since_turn: 6,
        },
        {
          hex_id: 'hex-b',
          scorched_turns_remaining: 1,
          fallout: 0,
          scorched_since_turn: 6,
          severity: 0.32,
        },
      ],
    })

    const state = useMapStore.getState().scorchedRegions
    expect(state.get('hex-a')).toMatchObject({
      since_turn: 6,
      ttl_turns: 3,
      fallout: 0.6,
    })
    expect(state.get('hex-b')).toMatchObject({
      since_turn: 6,
      ttl_turns: 1,
      severity: 0.32,
      fallout: 0,
    })

    useMapStore.getState().applyScorchedDiff({
      room_id: 'room-1',
      epoch: 1,
      turn: 7,
      changes: [
        {
          hex_id: 'hex-a',
          scorched_turns_remaining: 2,
          fallout: 0.3,
          scorched_since_turn: 6,
        },
      ],
    })

    expect(useMapStore.getState().scorchedRegions.get('hex-a')).toMatchObject({
      since_turn: 6,
      ttl_turns: 2,
      fallout: 0.3,
    })
  })

  it('drops expired scorch entries on advanceScorched', () => {
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

    useMapStore.getState().advanceScorched(8)
    expect(useMapStore.getState().scorchedRegions.has('hex-a')).toBe(true)

    useMapStore.getState().advanceScorched(9)
    expect(useMapStore.getState().scorchedRegions.has('hex-a')).toBe(false)
  })
})
