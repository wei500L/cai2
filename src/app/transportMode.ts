export type TransportMode = 'ws' | 'mock'

export function resolveTransportMode({
  pathname,
  roomIdFromQuery,
  allowMockFallback,
  forceMockMode,
}: {
  pathname: string
  roomIdFromQuery: string
  allowMockFallback: boolean
  forceMockMode: boolean
}): TransportMode {
  if (forceMockMode || allowMockFallback) {
    return 'mock'
  }

  return 'ws'
}
