import { afterEach, describe, expect, it, vi } from 'vitest'
import { factionMetaFixtures } from '@/mock/factions'
import { fetchFactionsMeta } from '../factionsMetaApi'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('factionsMetaApi', () => {
  it('fetches faction metadata from the room REST endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ factions_meta: factionMetaFixtures }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchFactionsMeta('room-1')).resolves.toEqual(factionMetaFixtures)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/debug/v1/rooms/room-1/factions_meta',
      expect.objectContaining({ signal: undefined }),
    )
  })

  it('accepts backend payloads with factions field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ factions: factionMetaFixtures }),
    }))

    await expect(fetchFactionsMeta('room-1')).resolves.toEqual(factionMetaFixtures)
  })

  it('throws on failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }))

    await expect(fetchFactionsMeta('room-1')).rejects.toThrow('Failed to fetch factions_meta: 503')
  })

  it('passes abort signals through to fetch', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn((_url, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => undefined)
      return Promise.reject(abortError)
    })
    vi.stubGlobal('fetch', fetchMock)

    controller.abort()
    await expect(fetchFactionsMeta('room-1', controller.signal)).rejects.toBe(abortError)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
