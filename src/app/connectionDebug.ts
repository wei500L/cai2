import { useSyncExternalStore } from 'react'

export type ConnectionDebugSnapshot = {
  lastInboundSeq: number
  queueDepth: number
  wsUrl: string
  mockEventEmittedCount: number
}

let snapshot: ConnectionDebugSnapshot = {
  lastInboundSeq: 0,
  queueDepth: 0,
  wsUrl: '',
  mockEventEmittedCount: 0,
}

const listeners = new Set<() => void>()

export function setConnectionDebugSnapshot(next: Partial<ConnectionDebugSnapshot>) {
  const merged = { ...snapshot, ...next }
  if (
    merged.lastInboundSeq === snapshot.lastInboundSeq &&
    merged.queueDepth === snapshot.queueDepth &&
    merged.wsUrl === snapshot.wsUrl &&
    merged.mockEventEmittedCount === snapshot.mockEventEmittedCount
  ) {
    return
  }

  snapshot = merged
  listeners.forEach((listener) => listener())
}

export function incrementMockEventEmittedCount() {
  setConnectionDebugSnapshot({
    mockEventEmittedCount: snapshot.mockEventEmittedCount + 1,
  })
}

export function useConnectionDebugSnapshot() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
    () => snapshot,
  )
}
