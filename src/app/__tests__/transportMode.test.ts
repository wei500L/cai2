import { describe, expect, it } from 'vitest'
import { resolveTransportMode } from '../transportMode'

describe('resolveTransportMode', () => {
  it('uses mock mode for /game without a room id', () => {
    expect(
      resolveTransportMode({
        pathname: '/game',
        roomIdFromQuery: '',
        allowMockFallback: false,
        forceMockMode: false,
      }),
    ).toBe('mock')
  })

  it('keeps ws mode for /game when a room id is present', () => {
    expect(
      resolveTransportMode({
        pathname: '/game',
        roomIdFromQuery: 'room-123',
        allowMockFallback: false,
        forceMockMode: false,
      }),
    ).toBe('ws')
  })

  it('prefers explicit mock overrides', () => {
    expect(
      resolveTransportMode({
        pathname: '/room-waiting',
        roomIdFromQuery: 'room-123',
        allowMockFallback: false,
        forceMockMode: true,
      }),
    ).toBe('mock')
  })
})
