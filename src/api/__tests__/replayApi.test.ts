import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchReplay, loadReplay, type ReplayDTO } from '../replayApi'

const replayDto: ReplayDTO = {
  room_id: 'room-1',
  generated_at_ms: 100,
  mode: 'solo_1v7',
  total_epochs: 1,
  total_turns: 1,
  timeline: [
    {
      epoch: 1,
      turn: 1,
      phase: 'resolve',
      key_event_ids: ['event-1'],
    },
  ],
  public_events: [
    {
      id: 'event-1',
      created_at_ms: 100,
      epoch: 1,
      turn: 1,
      phase: 'resolve',
      priority: 'P0',
      kind: 'betrayal',
      actor_faction: 'ironCrown',
      target_faction: 'starlight',
      payload: { reason: 'test' },
      narration: '铁冠帝国撕毁密约。',
    },
  ],
  private_messages: [
    {
      id: 'private-1',
      created_at_ms: 90,
      epoch: 1,
      turn: 1,
      phase: 'action',
      from_faction: 'ironCrown',
      to_factions: ['starlight'],
      visibility: { scope: 'faction_pair' },
      content: '交换边境清单。',
    },
  ],
  ai_internal_thoughts: [
    {
      faction_id: 'ironCrown',
      epoch: 1,
      turn: 1,
      text: '先稳住谈判桌。',
    },
  ],
  faction_curves: [
    {
      faction_id: 'ironCrown',
      points: [{ epoch: 1, turn: 1, total_power: 320 }],
    },
  ],
  relationship_snapshots: [
    {
      epoch: 1,
      matrix: { ironCrown: { starlight: 'hostile' } },
    },
  ],
  key_moments: [
    {
      id: 'event-1',
      created_at_ms: 100,
      epoch: 1,
      turn: 1,
      phase: 'resolve',
      priority: 'P0',
      kind: 'betrayal',
      actor_faction: 'ironCrown',
      payload: {},
      narration: '铁冠帝国撕毁密约。',
    },
  ],
  famous_quotes: [],
  betrayal_events: [],
  deception_stats: [
    {
      faction_id: 'ironCrown',
      lies: 3,
      exposed: 1,
      success_rate: 0.75,
    },
  ],
  final_factions: [],
  winner: 'ironCrown',
  final_narration: '铁冠帝国完成最终统治。',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('replayApi', () => {
  it('fetches the raw ReplayDTO from the backend REST endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => replayDto,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchReplay('room-1')).resolves.toEqual({ ok: true, data: replayDto })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/debug/v1/rooms/room-1/replay',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns NOT_FOUND when the replay endpoint is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    await expect(fetchReplay('missing-room')).resolves.toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      message: '房间不存在或回放尚未生成。',
    })
  })

  it('returns NETWORK when the replay request fails before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchReplay('room-1')).resolves.toMatchObject({
      ok: false,
      code: 'NETWORK',
      message: '网络请求失败。',
    })
  })

  it('returns PARSE when the replay response body is invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }))

    await expect(fetchReplay('room-1')).resolves.toMatchObject({
      ok: false,
      code: 'PARSE',
      message: '回放数据解析失败。',
    })
  })

  it('loads and normalizes REST replay data for the page view model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => replayDto,
    }))

    const result = await loadReplay('room-1')

    expect(result.events[0]).toMatchObject({
      id: 'event-1',
      createdAt: 100,
      actor: 'ironCrown',
      target: 'starlight',
    })
    expect(result.privateMessages[0]).toMatchObject({
      from: 'ironCrown',
      to: 'starlight',
      body: '交换边境清单。',
    })
    expect(result.deceptionStats[0].successRate).toBe(75)
  })

  it('returns TIMEOUT on timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }))

    const pending = expect(fetchReplay('room-1')).resolves.toMatchObject({
      ok: false,
      code: 'TIMEOUT',
      message: '请求超时。',
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await pending

    vi.useRealTimers()
  })
})
