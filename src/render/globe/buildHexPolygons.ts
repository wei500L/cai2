import { factionById, type FactionId } from '@/mock/factions'
import type { MapRegion } from '@/mock/types'

type Rgb = { r: number; g: number; b: number }

const FALLBACK_FACTION_TONES: Record<FactionId, { primary: string; glow: string; shadow: string }> = {
  ironCrown: { primary: '#8b1a1a', glow: '#ff3333', shadow: '#2d0a0a' },
  starlight: { primary: '#1a5f8b', glow: '#33aaff', shadow: '#0a1a2d' },
  emerald: { primary: '#1a8b3d', glow: '#33ff77', shadow: '#0a2d15' },
  ashen: { primary: '#8b5a1a', glow: '#ff9933', shadow: '#2d1e0a' },
  voidChurch: { primary: '#5a1a8b', glow: '#9933ff', shadow: '#1e0a2d' },
  aurora: { primary: '#1a8b8b', glow: '#33ffff', shadow: '#0a2d2d' },
  magma: { primary: '#8b3a1a', glow: '#ff6633', shadow: '#2d120a' },
  darkTide: { primary: '#6b5a1a', glow: '#ccaa33', shadow: '#231e0a' },
}

export type HexPolygonInput = {
  lat: number
  lng: number
  factionId: FactionId | null
  terrain: MapRegion['terrain']
  elevation: number
  hexId: string
  regionId: string
  owner: FactionId | null
  scorched: boolean
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

type HexPolygonRegion = {
  id: string
  owner?: FactionId | null
  faction?: FactionId | null
  factionId?: FactionId | null
  terrain: MapRegion['terrain']
  elevation?: number | null
  lat?: number | null
  lng?: number | null
  hex_id?: string | null
  hexId?: string | null
  centerLatLng?: MapRegion['centerLatLng']
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseCssColor(value: string, fallback: Rgb): Rgb {
  const color = value.trim()

  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      }
    }

    if (hex.length >= 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      }
    }
  }

  const rgbMatch = color.match(/rgba?\(([^)]+)\)/)
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()))
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return { r, g, b }
    }
  }

  return fallback
}

function mixRgb(a: Rgb, b: Rgb, amount: number) {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  }
}

function toRgba(color: Rgb, alpha: number) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
}

function resolveCssToken(token: string, fallback: string) {
  const match = token.match(/^var\((--[^)]+)\)$/)
  if (!match || typeof document === 'undefined') {
    return fallback
  }

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim()
  return resolved || fallback
}

function resolveFactionColors(factionId: FactionId) {
  const faction = factionById[factionId]
  const fallback = FALLBACK_FACTION_TONES[factionId]
  const primary = resolveCssToken(faction.primary, fallback.primary)
  const glow = resolveCssToken(faction.glow, fallback.glow)
  const shadow = resolveCssToken(faction.shadow, fallback.shadow)

  return {
    primary,
    glow,
    shadow,
    primaryRgb: parseCssColor(primary, parseCssColor(fallback.primary, { r: 128, g: 128, b: 128 })),
    glowRgb: parseCssColor(glow, parseCssColor(fallback.glow, { r: 160, g: 160, b: 160 })),
    shadowRgb: parseCssColor(shadow, parseCssColor(fallback.shadow, { r: 64, g: 64, b: 64 })),
  }
}

function getElevation(region: HexPolygonRegion) {
  if (typeof region.elevation === 'number' && Number.isFinite(region.elevation)) {
    return clamp(region.elevation, 0, 1)
  }

  return 0
}

function getLat(region: HexPolygonRegion) {
  if (typeof region.lat === 'number' && Number.isFinite(region.lat)) {
    return region.lat
  }

  return region.centerLatLng?.[0] ?? 0
}

function getLng(region: HexPolygonRegion) {
  if (typeof region.lng === 'number' && Number.isFinite(region.lng)) {
    return region.lng
  }

  return region.centerLatLng?.[1] ?? 0
}

function getHexId(region: HexPolygonRegion) {
  return region.hex_id ?? region.hexId ?? region.id
}

function getFactionId(region: HexPolygonRegion) {
  return region.factionId ?? region.owner ?? region.faction ?? null
}

function wrapLongitude(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function buildGeometry(lat: number, lng: number) {
  const delta = 0.08
  const north = clamp(lat + delta, -89.9, 89.9)
  const south = clamp(lat - delta, -89.9, 89.9)
  const east = wrapLongitude(lng + delta)
  const west = wrapLongitude(lng - delta)

  return {
    type: 'Polygon' as const,
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  }
}

function isScorched(region: HexPolygonRegion, scorchedRegions: ReadonlySet<string>) {
  const hexId = getHexId(region)
  return scorchedRegions.has(region.id) || scorchedRegions.has(hexId)
}

export function buildHexPolygons(
  regions: HexPolygonRegion[],
  scorchedRegions: ReadonlySet<string> = new Set<string>(),
): HexPolygonInput[] {
  return regions.map((region) => ({
    lat: getLat(region),
    lng: getLng(region),
    factionId: getFactionId(region),
    terrain: region.terrain,
    elevation: getElevation(region),
    hexId: getHexId(region),
    regionId: region.id,
    owner: region.owner ?? region.faction ?? region.factionId ?? null,
    scorched: isScorched(region, scorchedRegions),
    geometry: buildGeometry(getLat(region), getLng(region)),
  }))
}

export function hexPolygonColor(region: HexPolygonInput) {
  if (region.factionId === null) {
    return 'rgba(102, 110, 120, 0.55)'
  }

  const palette = resolveFactionColors(region.factionId)
  const altitudeBoost = region.elevation > 0.7 ? 0.15 : 0
  const isAshen = region.factionId === 'ashen'

  if (region.scorched) {
    return toRgba(
      mixRgb(palette.primaryRgb, palette.shadowRgb, 0.7),
      0.82,
    )
  }

  if (isAshen) {
    return toRgba(mixRgb(palette.primaryRgb, palette.shadowRgb, 0.45), 0.96)
  }

  if (altitudeBoost > 0) {
    return toRgba(mixRgb(palette.primaryRgb, palette.glowRgb, altitudeBoost), 0.98)
  }

  return palette.primary
}

export function hexPolygonAltitude(region: HexPolygonInput) {
  const terrainBoost: Record<MapRegion['terrain'], number> = {
    mountain: 0.005,
    fortress: 0.004,
    plains: 0,
    river: -0.001,
    desert: 0.0015,
  }

  const value = 0.005 + region.elevation * 0.012 + terrainBoost[region.terrain]
  return Number(clamp(value, 0.005, 0.02).toFixed(4))
}

export function hexPolygonMargin() {
  return 0.2
}
