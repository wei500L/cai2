import { describe, expect, it } from 'vitest'
import { hexPolygonColor, terrainColors } from '../stylePresets'

describe('stylePresets', () => {
  it('keeps the terrain palette anchored at the expected boundary colors', () => {
    expect(terrainColors.ocean).toBe('#0a1a2a')
    expect(terrainColors.plain).toBe('#3a3a3a')
    expect(terrainColors.plains).toBe('#3a3a3a')
    expect(terrainColors.forest).toBe('#1e3a1e')
    expect(terrainColors.mountain).toBe('#5a4a3a')
    expect(terrainColors.desert).toBe('#6a5a3a')
    expect(terrainColors.tundra).toBe('#7a8a9a')
  })

  it('mixes faction tint with terrain and darkens the night side', () => {
    const dayRiver = hexPolygonColor(
      {
        factionId: 'starlight',
        terrain: 'river',
        elevation: 0.1,
        lat: 8,
        lng: 0,
      },
      { sunLat: 10, sunLng: 0, nightMaskAlpha: 0 },
    )
    const dayPlains = hexPolygonColor(
      {
        factionId: 'starlight',
        terrain: 'plains',
        elevation: 0.5,
        lat: 8,
        lng: 0,
      },
      { sunLat: 10, sunLng: 0, nightMaskAlpha: 0 },
    )
    const nightPlains = hexPolygonColor(
      {
        factionId: 'starlight',
        terrain: 'plains',
        elevation: 0.5,
        lat: -78,
        lng: 180,
      },
      { sunLat: 10, sunLng: 0, nightMaskAlpha: 1 },
    )

    expect(dayRiver).toMatch(/^rgba\(/)
    expect(dayPlains).toMatch(/^rgba\(/)
    expect(nightPlains).toMatch(/^rgba\(/)
    expect(dayRiver).not.toBe(dayPlains)
    expect(nightPlains).not.toBe(dayPlains)
  })
})
