import { describe, expect, it } from 'vitest'
import type { ReplayTimelineNode, AIInnerThought } from '@/mock/replay'
import type { FactionId } from '@/mock/factions'
import type { DiaryEntry } from '@/protocol/types'
import { selectReplayThoughts } from '../AIInnerThoughtPanel'

const thoughts: AIInnerThought[] = [
  { factionId: 'ironCrown', epoch: 1, turn: 1, text: 'fallback-1' },
  { factionId: 'ironCrown', epoch: 1, turn: 2, text: 'fallback-2' },
  { factionId: 'starlight', epoch: 1, turn: 2, text: 'fallback-3' },
]

const replayTime: ReplayTimelineNode = {
  epoch: 1,
  turn: 2,
  phase: 'resolve',
  keyEventIds: [],
}

describe('AIInnerThoughtPanel replay selection', () => {
  it('prefers revealed diary entries for the focused faction', () => {
    const selected = selectReplayThoughts({
      thoughts,
      aiDiaries: {
        ironCrown: [
          {
            faction_id: 'ironCrown',
            epoch: 1,
            turn: 2,
            internal_thought: '真实想法',
            emotion: 'calm',
            triggers: [],
            created_at_ms: 100,
          },
        ],
      } as unknown as Record<FactionId, DiaryEntry[]>,
      hasDiariesRevealed: true,
      replayTime,
      currentFocusFaction: 'ironCrown',
    })

    expect(selected).toEqual([
      { factionId: 'ironCrown', epoch: 1, turn: 2, text: '真实想法' },
    ])
  })

  it('falls back to mock thoughts when no diary is present', () => {
    const selected = selectReplayThoughts({
      thoughts,
      aiDiaries: {} as unknown as Record<FactionId, DiaryEntry[]>,
      hasDiariesRevealed: false,
      replayTime,
      currentFocusFaction: 'ironCrown',
    })

    expect(selected).toEqual([
      { factionId: 'ironCrown', epoch: 1, turn: 2, text: 'fallback-2' },
    ])
  })
})
