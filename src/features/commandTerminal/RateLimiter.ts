import type { CommandMode } from './types'

type RateBucket = 'utterance' | 'military' | 'intel'

type RateRequest = {
  phaseKey: string
  playerId: string
  mode: CommandMode
}

export type RateSnapshot = {
  bucket: RateBucket
  used: number
  limit: number
  remaining: number
  blocked: boolean
  accepted?: boolean
}

const limits: Record<RateBucket, number> = {
  utterance: 5,
  military: 3,
  intel: 1,
}

const usage = new Map<string, number>()

export function getRateBucket(mode: CommandMode): RateBucket {
  if (mode === 'military') {
    return 'military'
  }

  if (mode === 'intel') {
    return 'intel'
  }

  return 'utterance'
}

function buildKey(request: RateRequest) {
  return `${request.phaseKey}:${request.playerId}:${getRateBucket(request.mode)}`
}

export function getRateSnapshot(request: RateRequest): RateSnapshot {
  const bucket = getRateBucket(request.mode)
  const used = usage.get(buildKey(request)) ?? 0
  const limit = limits[bucket]

  return {
    bucket,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    blocked: used >= limit,
  }
}

export function tryConsumeRate(request: RateRequest): RateSnapshot {
  const snapshot = getRateSnapshot(request)

  if (snapshot.blocked) {
    return { ...snapshot, accepted: false }
  }

  const nextUsed = snapshot.used + 1
  usage.set(buildKey(request), nextUsed)

  return {
    ...snapshot,
    used: nextUsed,
    remaining: Math.max(0, snapshot.limit - nextUsed),
    blocked: nextUsed >= snapshot.limit,
    accepted: true,
  }
}
