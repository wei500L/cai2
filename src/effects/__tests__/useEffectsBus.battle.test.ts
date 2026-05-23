import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { triggerBattleVisuals } from '../useEffectsBus'
import type { GameEvent } from '@/mock/types'

describe('triggerBattleVisuals', () => {
  beforeEach(() => {
    useGameStore.getState().initGame(42)
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('schedules shake and focus for captured battle events', () => {
    const state = useGameStore.getState()
    const target = state.regions[0]
    const event: GameEvent = {
      id: 'battle-1',
      createdAt: Date.now(),
      epoch: state.epoch.id,
      turn: state.epoch.turn,
      phase: state.epoch.phase,
      priority: 'P0',
      kind: 'battle',
      actor: 'ironCrown',
      target: 'starlight',
      payload: {
        region_id: target.id,
        attacker: 'ironCrown',
        defender: 'starlight',
        atk_loss: 10,
        def_loss: 20,
        territory_captured: true,
        morale_shift: 0.05,
        narrative: 'capture',
        attacker_remaining_troops: 90,
        defender_remaining_troops: 70,
      },
      narration: 'capture',
    }

    const shakes: Array<[string, number]> = []
    const boosts: Array<[string, string, string | undefined, boolean, number | undefined]> = []
    const focuses: Array<[string, string]> = []

    const card = triggerBattleVisuals(event, {
      onShake: (level, duration) => {
        shakes.push([level, duration])
      },
      onBoost: (attacker, defender, regionId, persist, life) => {
        boosts.push([attacker, defender, regionId, persist, life])
      },
      onFocus: (regionId, factionId) => {
        focuses.push([regionId, factionId])
      },
    })

    expect(card?.territoryCaptured).toBe(true)
    expect(shakes[0]).toEqual(['heavy', 500])
    expect(boosts[0]).toEqual(['ironCrown', 'starlight', target.id, false, 800])
    expect(focuses[0]).toEqual([target.id, 'ironCrown'])

    vi.advanceTimersByTime(500)
    expect(shakes[1]).toEqual(['medium', 500])
    vi.advanceTimersByTime(500)
    expect(shakes[2]).toEqual(['light', 500])
  })
})
