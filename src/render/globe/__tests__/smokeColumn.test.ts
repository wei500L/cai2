import { afterEach, describe, expect, it } from 'vitest'
import { Scene } from 'three'
import { createSmokeColumn } from '../smokeColumn'

describe('smokeColumn', () => {
  afterEach(() => {
    // no-op; scene-local allocations are disposed per test
  })

  it('keeps only active scorch columns and disposes cleanly', () => {
    const scene = new Scene()
    const smoke = createSmokeColumn(scene, 4)

    smoke.sync([
      {
        hexId: 'hex-a',
        lat: 12,
        lng: 34,
        severity: 0.35,
        fallout: 0,
        ttlTurns: 2,
        sinceTurn: 5,
      },
      {
        hexId: 'hex-b',
        lat: -8,
        lng: 49,
        severity: 0.72,
        fallout: 0.3,
        ttlTurns: 3,
        sinceTurn: 5,
      },
    ])

    expect(smoke.activeCount()).toBe(1)
    expect(scene.children).toHaveLength(1)

    smoke.update(16)
    smoke.sync([])

    expect(smoke.activeCount()).toBe(0)

    smoke.dispose()
    expect(scene.children).toHaveLength(0)
  })
})
