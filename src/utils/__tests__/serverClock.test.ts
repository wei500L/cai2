import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { getRemainingMs, getServerNowMs } from '../serverClock'

describe('serverClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    useGameStore.getState().initGame(1)
    gameStoreApi.setState({
      serverClockOffsetMs: 0,
      serverClockSampleAtMs: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns local now plus the calibrated server offset', () => {
    gameStoreApi.setState({ serverClockOffsetMs: 2_500 })

    expect(getServerNowMs()).toBe(12_500)
  })

  it('computes remaining time from phase start and full duration', () => {
    gameStoreApi.setState({ serverClockOffsetMs: -1_000 })

    expect(getRemainingMs(5_000, 10_000)).toBe(6_000)
  })
})
