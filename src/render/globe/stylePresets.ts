import { factionById, type FactionId } from '@/mock/factions'
import type { MapRegion } from '@/mock/types'

type Rgb = {
  r: number
  g: number
  b: number
}

export type HexPolygonLike = {
  factionId: FactionId | null
  terrain: MapRegion['terrain']
  elevation?: number
  lat?: number
  lng?: number
  scorched?: boolean
}

export type HexPolygonColorContext = {
  sunLat?: number
  sunLng?: number
  nightMaskAlpha?: number
}

export const terrainColors = {
  ocean: '#0a1a2a',
  plain: '#3a3a3a',
  plains: '#3a3a3a',
  forest: '#1e3a1e',
  mountain: '#5a4a3a',
  desert: '#6a5a3a',
  tundra: '#7a8a9a',
} as const

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
  const mix = clamp(amount, 0, 1)
  return {
    r: a.r + (b.r - a.r) * mix,
    g: a.g + (b.g - a.g) * mix,
    b: a.b + (b.b - a.b) * mix,
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
    primaryRgb: parseCssColor(primary, parseCssColor(fallback.primary, { r: 128, g: 128, b: 128 })),
    glowRgb: parseCssColor(glow, parseCssColor(fallback.glow, { r: 160, g: 160, b: 160 })),
    shadowRgb: parseCssColor(shadow, parseCssColor(fallback.shadow, { r: 64, g: 64, b: 64 })),
  }
}

function terrainBaseColor(terrain: MapRegion['terrain']) {
  switch (terrain) {
    case 'mountain':
    case 'fortress':
      return terrainColors.mountain
    case 'river':
      return terrainColors.ocean
    case 'desert':
      return terrainColors.desert
    case 'plains':
    default:
      return terrainColors.plains
  }
}

function surfaceNormal(lat: number, lng: number) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const cosLat = Math.cos(latRad)
  return {
    x: cosLat * Math.cos(lngRad),
    y: Math.sin(latRad),
    z: cosLat * Math.sin(lngRad),
  }
}

function sunVector(lat: number, lng: number) {
  const normal = surfaceNormal(lat, lng)
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

export function hexPolygonColor(region: HexPolygonLike, ctx: HexPolygonColorContext = {}) {
  const factionId = region.factionId
  const faction = factionId === null ? null : resolveFactionColors(factionId)
  const elevation = clamp(region.elevation ?? 0, 0, 1)
  const sunLat = ctx.sunLat ?? 10
  const sunLng = ctx.sunLng ?? 0
  const nightMaskAlpha = clamp(ctx.nightMaskAlpha ?? 0.6, 0, 1)
  const normal = surfaceNormal(region.lat ?? 0, region.lng ?? 0)
  const sun = sunVector(sunLat, sunLng)
  const sunDot = normal.x * sun.x + normal.y * sun.y + normal.z * sun.z
  const nightBlend = clamp(-sunDot, 0, 1) * nightMaskAlpha

  const baseRgb = parseCssColor(
    terrainBaseColor(region.terrain),
    parseCssColor(terrainColors.plains, { r: 58, g: 58, b: 58 }),
  )

  let color = baseRgb
  if (region.terrain === 'river') {
    if (faction) {
      color = mixRgb(baseRgb, faction.primaryRgb, 0.05)
    }
  } else if (faction) {
    color = mixRgb(baseRgb, faction.primaryRgb, 0.6)
  }

  if (region.scorched && faction) {
    color = mixRgb(color, faction.shadowRgb, 0.45)
  }

  const brightness = 1 - nightBlend * 0.5
  if (faction) {
    const glowBlend = clamp(elevation * 0.24 + Math.max(sunDot, 0) * 0.08, 0, 0.24)
    color = mixRgb(color, faction.glowRgb, glowBlend)
  }

  color = mixRgb(color, { r: 0, g: 0, b: 0 }, 1 - brightness)

  const alpha = region.scorched ? 0.84 : factionId === null ? 0.72 : 0.95
  return toRgba(color, alpha)
}
