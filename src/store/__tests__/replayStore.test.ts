import { afterEach, describe, expect, it } from 'vitest'
import type { ReplayData } from '@/types/replay'
import {
  replayStore,
  selectReplayAIInnerThoughts,
  selectReplayFactionCurves,
  selectReplayKeyMoments,
} from '../replayStore'

describe('replayStore selectors', () => {
  afterEach(() => {
    replayStore.getState().reset()
  })

  it('reuses empty replay arrays while data is not loaded', () => {
    const state = replayStore.getState()

    expect(selectReplayAIInnerThoughts(state)).toBe(selectReplayAIInnerThoughts(state))
    expect(selectReplayFactionCurves(state)).toBe(selectReplayFactionCurves(state))
    expect(selectReplayKeyMoments(state)).toBe(selectReplayKeyMoments(state))
  })

  it('returns loaded replay arrays by reference', () => {
    const replay: ReplayData = {
      timeline: [],
      privateMessages: [],
      aiInnerThoughts: [
        {
          factionId: 'ironCrown',
          epoch: 1,
          turn: 1,
          text: 'test thought',
        },
      ],
      factionCurves: [
        {
          factionId: 'ironCrown',
          points: [{ epoch: 1, turn: 1, totalPower: 100 }],
        },
      ],
      relationshipSnapshots: [],
      deceptionStats: [],
      events: [],
      keyMoments: [
        {
          id: 'moment-1',
          epoch: 1,
          turn: 1,
          title: 'test moment',
          caption: 'test caption',
          eventId: 'event-1',
          factionId: 'ironCrown',
        },
      ],
    }

    replayStore.getState().loadMockFixture(replay)
    const state = replayStore.getState()

    expect(selectReplayAIInnerThoughts(state)).toBe(replay.aiInnerThoughts)
    expect(selectReplayFactionCurves(state)).toBe(replay.factionCurves)
    expect(selectReplayKeyMoments(state)).toBe(replay.keyMoments)
  })
})
