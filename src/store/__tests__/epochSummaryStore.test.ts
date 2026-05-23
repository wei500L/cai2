import { afterEach, describe, expect, it } from 'vitest'
import { epochSummaryStore } from '../epochSummaryStore'

describe('epochSummaryStore', () => {
  afterEach(() => {
    epochSummaryStore.getState().reset()
  })

  it('stores epic and summary payloads by epoch', () => {
    const epic = {
      epoch: 3,
      source: 'template_fallback' as const,
      narrative: '纪元三结束。',
    }
    const summary = {
      epoch: 3,
      source: 'template_fallback' as const,
      highlights: {
        majorEvents: [],
        wars: [],
        betrayals: [],
      },
      rankings: [],
    }

    epochSummaryStore.getState().applyEpic(epic)
    epochSummaryStore.getState().applySummary(summary)

    const state = epochSummaryStore.getState()
    expect(state.latestEpoch).toBe(3)
    expect(state.byEpoch.get(3)).toEqual({
      epic,
      summary,
    })
  })

  it('keeps epochs isolated and resets cleanly', () => {
    epochSummaryStore.getState().applyEpic({
      epoch: 1,
      source: 'llm',
      narrative: '纪元一。',
    })
    epochSummaryStore.getState().applySummary({
      epoch: 2,
      source: 'llm',
      highlights: {
        majorEvents: [],
        wars: [],
        betrayals: [],
      },
      rankings: [],
    })

    expect(epochSummaryStore.getState().byEpoch.get(1)?.epic?.narrative).toBe('纪元一。')
    expect(epochSummaryStore.getState().byEpoch.get(2)?.summary?.epoch).toBe(2)

    epochSummaryStore.getState().reset()

    expect(epochSummaryStore.getState()).toMatchObject({
      latestEpoch: null,
    })
    expect(epochSummaryStore.getState().byEpoch.size).toBe(0)
  })
})
