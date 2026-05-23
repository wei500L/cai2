import { describe, expect, it } from 'vitest'
import { GLOBE_RADIUS, globeSurfaceNormal, latLngToVec3 } from '../coordinates'

describe('globe coordinates', () => {
  it('matches the three-globe polar coordinate convention', () => {
    const primeMeridian = globeSurfaceNormal(0, 0)
    const east = globeSurfaceNormal(0, 90)
    const northPole = globeSurfaceNormal(90, 0)

    expect(primeMeridian.x).toBeCloseTo(0, 5)
    expect(primeMeridian.y).toBeCloseTo(0, 5)
    expect(primeMeridian.z).toBeCloseTo(1, 5)
    expect(east.x).toBeCloseTo(1, 5)
    expect(east.y).toBeCloseTo(0, 5)
    expect(east.z).toBeCloseTo(0, 5)
    expect(northPole.x).toBeCloseTo(0, 5)
    expect(northPole.y).toBeCloseTo(1, 5)
    expect(northPole.z).toBeCloseTo(0, 5)
  })

  it('scales globe positions by relative altitude', () => {
    const origin = latLngToVec3(0, 0, 0)
    const elevated = latLngToVec3(0, 0, 0.5)

    expect(origin.length()).toBeCloseTo(GLOBE_RADIUS, 5)
    expect(elevated.length()).toBeCloseTo(GLOBE_RADIUS * 1.5, 5)
  })
})
