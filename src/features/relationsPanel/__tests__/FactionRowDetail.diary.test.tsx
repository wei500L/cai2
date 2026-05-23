import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { factionMetaFixtures } from '@/mock/factions'
import type { FactionId } from '@/types/faction'
import type { FactionState } from '@/types'
import type { DiaryEntry } from '@/protocol/types'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { FactionRowDetail, formatDiaryPreview } from '../FactionRowDetail'

function factionState(): FactionState {
  return {
    id: 'ironCrown',
    military: 80,
    economy: 70,
    diplomacy: 60,
    culture: 50,
    morale: 70,
    totalPower: 330,
    status: 'stable',
  }
}

describe('FactionRowDetail diary reveal', () => {
  const ironCrownMeta = factionMetaFixtures.find((faction) => faction.id === 'ironCrown')

  beforeEach(() => {
    useGameStore.getState().initGame()
    gameStoreApi.setState({
      roomStatus: 'running',
      aiDiaries: {} as unknown as Record<FactionId, DiaryEntry[]>,
    })
  })

  it('shows the fog placeholder before reveal', () => {
    const markup = renderToStaticMarkup(
      <FactionRowDetail
        faction={ironCrownMeta ?? factionMetaFixtures[0]}
        factionState={factionState()}
        treaties={[]}
        isSelf={false}
      />,
    )

    expect(markup).toContain('此势力的想法仍是迷雾')
  })

  it('formats the latest diary summary after reveal', () => {
    gameStoreApi.setState((state) => ({
      ...state,
      roomStatus: 'finished',
      aiDiaries: {
        ironCrown: [
          {
            faction_id: 'ironCrown',
            epoch: 2,
            turn: 3,
            internal_thought: '先稳住局面，再找机会反击。',
            emotion: 'grim',
            triggers: [],
            created_at_ms: 100,
          },
        ],
      } as unknown as Record<FactionId, DiaryEntry[]>,
    }))

    const state = useGameStore.getState()
    const preview = formatDiaryPreview(state.aiDiaries.ironCrown[0])

    expect(state.hasDiariesRevealed()).toBe(true)
    expect(preview.meta).toBe('E2.T3 · grim')
    expect(preview.text).toBe('先稳住局面，再找机会反击。')
  })
})
