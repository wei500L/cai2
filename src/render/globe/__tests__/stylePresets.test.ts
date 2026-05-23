import { afterEach, describe, expect, it, vi } from 'vitest'
import { hexPolygonColor, terrainColors } from '../stylePresets'

describe('stylePresets', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('shifts scorched hexes toward ash tones and green fallout flicker', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const calmScorch = hexPolygonColor(
      {
        factionId: 'starlight',
        terrain: 'plains',
        elevation: 0.42,
        lat: 12,
        lng: 34,
      },
      {
        sunLat: 10,
        sunLng: 0,
        nightMaskAlpha: 0,
        scorchedEntry: {
          since_turn: 5,
          ttl_turns: 3,
          severity: 0,
          fallout: 0,
        },
      },
    )
    const falloutScorch = hexPolygonColor(
      {
        factionId: 'starlight',
        terrain: 'plains',
        elevation: 0.42,
        lat: 12,
        lng: 34,
      },
      {
        sunLat: 10,
        sunLng: 0,
        nightMaskAlpha: 0,
        scorchedEntry: {
          since_turn: 5,
          ttl_turns: 3,
          severity: 1,
          fallout: 0.6,
        },
      },
    )

    const calmMatch = calmScorch.match(/^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/)
    const falloutMatch = falloutScorch.match(/^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/)

    expect(calmMatch).not.toBeNull()
    expect(falloutMatch).not.toBeNull()

    const calmGreen = Number(calmMatch?.[2])
    const calmBlue = Number(calmMatch?.[3])
    const calmAlpha = Number(calmMatch?.[4])
    const falloutRed = Number(falloutMatch?.[1])
    const falloutGreen = Number(falloutMatch?.[2])
    const falloutBlue = Number(falloutMatch?.[3])
    const falloutAlpha = Number(falloutMatch?.[4])

    expect(calmAlpha).toBeGreaterThan(0.58)
    expect(calmAlpha).toBeLessThanOrEqual(0.92)
    expect(falloutGreen).toBeGreaterThanOrEqual(falloutRed)
    expect(falloutBlue).toBeLessThanOrEqual(falloutGreen)
    expect(falloutAlpha).toBeGreaterThan(0.58)
    expect(falloutScorch).not.toBe(calmScorch)
    expect(calmGreen).toBeGreaterThanOrEqual(calmBlue)
  })
})
