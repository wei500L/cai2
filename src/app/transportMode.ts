export type TransportMode = 'ws' | 'mock'

export function resolveTransportMode(options: {
  pathname: string
  roomIdFromQuery: string
  allowMockFallback: boolean
  forceMockMode: boolean
}): TransportMode {
  const { allowMockFallback, forceMockMode } = options
  if (forceMockMode || allowMockFallback) {
    return 'mock'
  }

  return 'ws'
}
