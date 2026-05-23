import { beforeEach, describe, expect, it } from 'vitest'
import { gameStoreApi, useGameStore } from '../gameStore'

describe('gameStore server clock offset', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(1)
    gameStoreApi.setState({
      serverClockOffsetMs: 0,
      serverClockSampleAtMs: 0,
    })
  })

  it('uses the first server clock sample directly', () => {
    useGameStore.getState()._applyServerClockSample(12_000, 10_000)

    expect(useGameStore.getState().serverClockOffsetMs).toBe(2_000)
    expect(useGameStore.getState().serverClockSampleAtMs).toBe(10_000)
  })

  it('smooths later samples with EMA', () => {
    useGameStore.getState()._applyServerClockSample(12_000, 10_000)
    useGameStore.getState()._applyServerClockSample(13_000, 10_000)

    expect(useGameStore.getState().serverClockOffsetMs).toBe(2_300)
  })
})
