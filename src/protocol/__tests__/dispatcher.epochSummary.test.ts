import { afterEach, describe, expect, it } from 'vitest'
import { dispatchEpochNarrationMessage } from '../dispatcher'
import { epochSummaryStore } from '@/store/epochSummaryStore'

describe('dispatcher epoch narration routing', () => {
  afterEach(() => {
    epochSummaryStore.getState().reset()
  })

  it('routes epic and summary narration messages into the epoch summary store', () => {
    const epicResult = dispatchEpochNarrationMessage({
      v: 1,
      id: 'epic-1',
      t: 'arbitrate.epic_narration',
      ts: 1,
      seq: 1,
      p: {
        epoch: 6,
        source: 'llm',
        narrative: '纪元六终结。',
      },
    })

    const summaryResult = dispatchEpochNarrationMessage({
      v: 1,
      id: 'summary-1',
      t: 'arbitrate.summary_narration',
      ts: 2,
      seq: 2,
      p: {
        epoch: 6,
        source: 'template_fallback',
        highlights: {
          majorEvents: [],
          wars: [],
          betrayals: [],
        },
        rankings: [],
      },
    })

    const entry = epochSummaryStore.getState().byEpoch.get(6)
    expect(epicResult).toBe(true)
    expect(summaryResult).toBe(true)
    expect(entry?.epic?.narrative).toBe('纪元六终结。')
    expect(entry?.summary?.source).toBe('template_fallback')
  })
})
