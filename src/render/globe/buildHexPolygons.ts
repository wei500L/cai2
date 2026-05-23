import type { FactionId } from '@/mock/factions'
import type { MapRegion } from '@/mock/types'
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
  return resolveHexPolygonColor(region)
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
