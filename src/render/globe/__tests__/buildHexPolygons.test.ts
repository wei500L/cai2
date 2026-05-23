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
    expect(hexPolygonColor(cells[0])).toBe('#1a5f8b')
    expect(hexPolygonColor(cells[1])).toMatch(/^rgba\(/)
    expect(hexPolygonAltitude(cells[1])).toBeGreaterThan(hexPolygonAltitude(cells[0]))
    expect(hexPolygonAltitude(cells[0])).toBeGreaterThanOrEqual(0.005)
    expect(hexPolygonAltitude(cells[1])).toBeLessThanOrEqual(0.02)
    expect(hexPolygonMargin()).toBe(0.2)
  })
})
