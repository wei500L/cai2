import { describe, expect, it } from 'vitest'
import {
  buildHexPolygons,
  hexPolygonAltitude,
  hexPolygonColor,
  hexPolygonMargin,
} from '../buildHexPolygons'

describe('buildHexPolygons', () => {
  it('maps core fields and resolves color, altitude and margin', () => {
    const cells = buildHexPolygons(
      [
        {
          id: 'hex_a',
          owner: 'starlight',
          terrain: 'plains',
          elevation: 0.18,
          lat: 12.345,
          lng: 67.89,
          hex_id: 'hex_a',
          centerLatLng: [12.345, 67.89],
        },
        {
          id: 'hex_b',
          owner: 'ashen',
          terrain: 'mountain',
          elevation: 0.94,
          lat: -21.5,
          lng: 143.25,
          hex_id: 'hex_b',
          centerLatLng: [-21.5, 143.25],
        },
      ],
      new Set(['hex_b']),
    )

    expect(cells[0]).toMatchObject({
      lat: 12.345,
      lng: 67.89,
      factionId: 'starlight',
      terrain: 'plains',
      elevation: 0.18,
      hexId: 'hex_a',
    })
    expect(hexPolygonColor(cells[0])).toMatch(/^rgba\(/)
    expect(hexPolygonColor(cells[1])).toMatch(/^rgba\(/)
    expect(hexPolygonColor(cells[0])).not.toBe(hexPolygonColor(cells[1]))
    expect(hexPolygonAltitude(cells[1])).toBeGreaterThan(hexPolygonAltitude(cells[0]))
    expect(hexPolygonAltitude(cells[0])).toBeGreaterThanOrEqual(0.005)
    expect(hexPolygonAltitude(cells[1])).toBeLessThanOrEqual(0.02)
    expect(hexPolygonAltitude(cells[1], new Map([['hex_b', { any: 'value' }]]))).toBeCloseTo(
      hexPolygonAltitude(cells[1]) * 0.5,
      4,
    )
    expect(hexPolygonMargin()).toBe(0.08)
  })

  it('handles unowned, ashen and high-elevation cells distinctly', () => {
    const cells = buildHexPolygons([
      {
        id: 'neutral',
        factionId: null,
        terrain: 'river',
        elevation: 0,
        centerLatLng: [1, 2],
      },
      {
        id: 'ashen',
        owner: 'ashen',
        terrain: 'desert',
        elevation: 0.4,
        centerLatLng: [3, 4],
      },
      {
        id: 'glow',
        owner: 'aurora',
        terrain: 'fortress',
        elevation: 1,
        centerLatLng: [5, 6],
      },
    ])

    expect(cells[0]).toMatchObject({
      lat: 1,
      lng: 2,
      hexId: 'neutral',
      factionId: null,
    })
    expect(hexPolygonColor(cells[0])).toMatch(/^rgba\(/)
    expect(hexPolygonColor(cells[1])).toMatch(/^rgba\(/)
    expect(hexPolygonColor(cells[2])).toMatch(/^rgba\(/)
    expect(hexPolygonAltitude(cells[0])).toBe(0.005)
    expect(hexPolygonAltitude(cells[2])).toBe(0.02)
  })
})
