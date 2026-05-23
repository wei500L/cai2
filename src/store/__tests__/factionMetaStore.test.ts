import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factionMetaFixtures } from '@/mock/factions'
import { factionMetaStore } from '../factionMetaStore'

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
})
