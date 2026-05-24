import { create } from 'zustand'
import { fetchReplay, normalizeReplayDto, type ReplayFetchErrorCode, type ReplayFetchResult } from '@/api/replayApi'
import type { ReplayData } from '@/types/replay'

export type ReplayStatus = 'idle' | 'loading' | 'success' | 'error' | 'mock'

type ReplayState = {
  roomId: string | null
  status: ReplayStatus
  data: ReplayData | null
  errorCode: ReplayFetchErrorCode | null
  errorMessage: string | null
  lastFetchedAt: number | null
  load: (roomId: string, signal?: AbortSignal) => Promise<ReplayFetchResult>
  retry: (signal?: AbortSignal) => Promise<ReplayFetchResult>
  reset: () => void
  loadMockFixture: (fixture: ReplayData, roomId?: string | null) => void
}

const emptyState = {
  roomId: null,
  status: 'idle' as ReplayStatus,
  data: null,
  errorCode: null,
  errorMessage: null,
  lastFetchedAt: null,
}

let loadToken = 0
const emptyAIInnerThoughts: ReplayData['aiInnerThoughts'] = []
const emptyFactionCurves: ReplayData['factionCurves'] = []
const emptyKeyMoments: ReplayData['keyMoments'] = []

function setLoadedState(data: ReplayData, roomId: string, status: ReplayStatus) {
  return {
    roomId,
    status,
    data,
    errorCode: null,
    errorMessage: null,
    lastFetchedAt: Date.now(),
  }
}

function setErrorState(roomId: string, code: ReplayFetchErrorCode, message: string) {
  return {
    roomId,
    status: 'error' as const,
    data: null,
    errorCode: code,
    errorMessage: message,
    lastFetchedAt: null,
  }
}

export const replayStore = create<ReplayState>((set, get) => ({
  ...emptyState,
  load: async (roomId, signal) => {
    const token = ++loadToken
    set({
      roomId,
      status: 'loading',
      data: null,
      errorCode: null,
      errorMessage: null,
      lastFetchedAt: null,
    })

    const result = await fetchReplay(roomId, signal)
    if (token !== loadToken) {
      return result
    }

    if (!result.ok) {
      set(setErrorState(roomId, result.code, result.message))
      return result
    }

    try {
      set(setLoadedState(normalizeReplayDto(result.data), roomId, 'success'))
    } catch {
      const fallback: ReplayFetchResult = { ok: false, code: 'PARSE', message: '回放数据解析失败。' }
      set(setErrorState(roomId, fallback.code, fallback.message))
      return fallback
    }

    return result
  },
  retry: async (signal) => {
    const { roomId } = get()
    if (!roomId) {
      return { ok: false, code: 'NOT_FOUND', message: '房间不存在或回放尚未生成。' }
    }

    return get().load(roomId, signal)
  },
  reset: () => {
    loadToken += 1
    set(emptyState)
  },
  loadMockFixture: (fixture, roomId = 'mock') => {
    loadToken += 1
    set(setLoadedState(fixture, roomId ?? 'mock', 'mock'))
  },
}))

export function selectReplayAIInnerThoughts(state: ReplayState): ReplayData['aiInnerThoughts'] {
  return state.data?.aiInnerThoughts ?? emptyAIInnerThoughts
}

export function selectReplayFactionCurves(state: ReplayState): ReplayData['factionCurves'] {
  return state.data?.factionCurves ?? emptyFactionCurves
}

export function selectReplayKeyMoments(state: ReplayState): ReplayData['keyMoments'] {
  return state.data?.keyMoments ?? emptyKeyMoments
}

export function useReplay<T>(selector: (state: ReplayState) => T): T
export function useReplay(): ReplayState
export function useReplay<T>(selector?: (state: ReplayState) => T) {
  const selectorFn = selector ?? ((state: ReplayState) => state as unknown as T)
  return replayStore(selectorFn)
}
