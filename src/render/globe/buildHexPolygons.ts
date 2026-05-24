import type { FactionId } from '@/types/faction'
import type { MapRegion } from '@/types'
import { hexPolygonColor as resolveHexPolygonColor } from '@/render/globe/stylePresets'

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

function buildGeometry(lat: number, lng: number) {
  // Delta was a typo (0.08 instead of 8.0), which resulted in 17km squares instead of 1700km squares,
  // causing h3.polyfill to drop them or render sparse dots instead of a continuous mosaic.
  const delta = 8.0
  const north = clamp(lat + delta, -89.9, 89.9)
  const south = clamp(lat - delta, -89.9, 89.9)

  // DO NOT use wrapLongitude here! If the polygon crosses the antimeridian,
  // wrapping it back to -180 causes h3.polyfill to interpret the polygon as
  // wrapping the LONG way around the globe (344 degrees instead of 16 degrees).
  // This generates millions of hexes and crashes the renderer, resulting in a black globe.
  // h3-js and three-globe natively support longitudes > 180 or < -180 for this exact reason.
  const east = lng + delta
  const west = lng - delta

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

function isScorched(
  region: HexPolygonRegion,
  scorchedRegions: ReadonlySet<string> | ReadonlyMap<string, unknown>,
) {
  const hexId = getHexId(region)
  return scorchedRegions.has(region.id) || scorchedRegions.has(hexId)
}

export function buildHexPolygons(
  regions: HexPolygonRegion[],
  scorchedRegions: ReadonlySet<string> | ReadonlyMap<string, unknown> = new Set<string>(),
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
  return resolveHexPolygonColor(region)
}

export function hexPolygonAltitude(region: HexPolygonInput, scorchedRegions?: ReadonlySet<string> | ReadonlyMap<string, unknown>) {
  const terrainBoost: Record<MapRegion['terrain'], number> = {
    mountain: 0.005,
    fortress: 0.004,
    plains: 0,
    river: -0.001,
    desert: 0.0015,
  }

  const value = 0.005 + region.elevation * 0.012 + terrainBoost[region.terrain]
  const altitude = Number(clamp(value, 0.005, 0.02).toFixed(4))
  if (!scorchedRegions) {
    return altitude
  }

  return scorchedRegions.has(region.hexId) || scorchedRegions.has(region.regionId)
    ? Number((altitude * 0.5).toFixed(4))
    : altitude
}

export function hexPolygonMargin() {
  return 0.08
}
