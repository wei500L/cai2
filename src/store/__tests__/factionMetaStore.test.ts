import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factionMetaFixtures } from '@/mock/factions'
import { createAllFactionMetaSelector, factionMetaStore } from '../factionMetaStore'

describe('factionMetaStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(12_345)
    factionMetaStore.getState().reset()
  })

  afterEach(() => {
    factionMetaStore.getState().reset()
    vi.useRealTimers()
  })

  it('applies websocket factions_meta payloads', () => {
    factionMetaStore.getState().applyFactionsMeta({
      room_id: 'room-1',
      schema_version: 'v1',
      factions_meta: factionMetaFixtures,
    })

    expect(factionMetaStore.getState().source).toBe('ws')
    expect(factionMetaStore.getState().schemaVersion).toBe('v1')
    expect(factionMetaStore.getState().loadedAt).toBe(12_345)
    expect(factionMetaStore.getState().byId.ironCrown?.name).toBe('铁冠帝国')
  })

  it('accepts backend room.factions_meta payloads with factions field', () => {
    factionMetaStore.getState().applyFactionsMeta({
      room_id: 'room-1',
      schema_version: 'v1',
      factions: [{
        id: 'ironCrown',
        name: '铁冠帝国',
        short_name: '铁冠',
        primary_color: '#8B1A1A',
        glow_color: '#FF3333',
        shadow_color: '#2D0A0A',
        speech_style: 'aggressive',
        speech_style_label: '强硬征服',
        speech_style_description: '强硬。',
        civilization_traits: ['军事工业化', '等级森严', '重装军团'],
        ai_archetype: '铁血征服者。',
        advantage: '军事力+20%',
        slogan: '臣服，才配获得秩序。',
        trigger_words: ['臣服'],
      }],
    })

    const meta = factionMetaStore.getState().byId.ironCrown
    expect(meta?.primary).toBe('#8B1A1A')
    expect(meta?.glow).toBe('#FF3333')
    expect(meta?.civilization).toBe('军事工业化，等级森严')
    expect(meta?.trigger_words).toEqual(['臣服'])
  })

  it('tracks rest and mock sources independently', () => {
    factionMetaStore.getState().applyFromRest(factionMetaFixtures)
    expect(factionMetaStore.getState().source).toBe('rest')

    factionMetaStore.getState().applyFromMock(factionMetaFixtures)
    expect(factionMetaStore.getState().source).toBe('mock')
    expect(factionMetaStore.getState().schemaVersion).toBe('mock')
  })

  it('resets to pending state', () => {
    factionMetaStore.getState().applyFromRest(factionMetaFixtures)
    factionMetaStore.getState().reset()

    expect(factionMetaStore.getState()).toMatchObject({
      byId: {},
      schemaVersion: null,
      loadedAt: null,
      source: 'pending',
    })
  })

  it('reuses the ordered faction list while byId stays unchanged', () => {
    const selectAllFactionMeta = createAllFactionMetaSelector()
    const state = factionMetaStore.getState()

    factionMetaStore.getState().applyFromRest(factionMetaFixtures)

    const first = selectAllFactionMeta(factionMetaStore.getState())
    const second = selectAllFactionMeta(factionMetaStore.getState())

    expect(second).toBe(first)
    expect(first).toHaveLength(factionMetaFixtures.length)
    expect(first[0]?.id).toBe(factionMetaFixtures[0]?.id)

    const nextById = { ...factionMetaStore.getState().byId }
    const updated = selectAllFactionMeta({ ...state, byId: nextById })

    expect(updated).not.toBe(first)
    expect(updated).toEqual(first)
  })
})
