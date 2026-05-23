import { gameStoreApi } from '@/store/gameStore'

export function getServerNowMs() {
  return Date.now() + gameStoreApi.getState().serverClockOffsetMs
}

export function getRemainingMs(phaseStartedAtMs: number, phaseDurationMs: number) {
  return phaseStartedAtMs + phaseDurationMs - getServerNowMs()
}
