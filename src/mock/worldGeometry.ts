// MOCK only — backend is the source of truth

import { factionIds, type FactionId } from '@/components/hudTheme'
import { buildNeighbors } from '@/render/buildNeighbors'
import type { MapRegion } from '@/mock/types'
import type { RegionEntry, WorldGeometryPayload } from '@/protocol/types'
import { mulberry32, randomFloat, randomInt } from '@/utils/random'

export const DEFAULT_WORLD_GEOMETRY_SEED = 2_026_052_2
const HEX_RESOLUTION = 4
const TOTAL_CELLS = 700
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

type SphericalPoint = {
  lat: number
  lng: number
}

type GeneratedCell = MapRegion & {
  elevation: number
  factionId: FactionId
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function wrapLongitude(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function sphericalFibonacciPoint(index: number, total: number, phase: number): SphericalPoint {
  const y = 1 - (2 * (index + 0.5)) / total
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN_ANGLE * (index + phase)
  const x = Math.cos(theta) * radius
  const z = Math.sin(theta) * radius

  return {
    lat: (Math.asin(y) * 180) / Math.PI,
    lng: wrapLongitude((Math.atan2(z, x) * 180) / Math.PI),
  }
}

function distanceBetween(left: SphericalPoint, right: SphericalPoint) {
  const lat1 = (left.lat * Math.PI) / 180
  const lng1 = (left.lng * Math.PI) / 180
  const lat2 = (right.lat * Math.PI) / 180
  const lng2 = (right.lng * Math.PI) / 180
  const latDelta = lat2 - lat1
  const lngDelta = lng2 - lng1
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2

  return 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

function pickTerrain(
  lat: number,
  elevation: number,
  capitalDistance: number,
  noise: number,
): MapRegion['terrain'] {
  if (elevation >= 0.82 || (Math.abs(lat) > 60 && noise > 0.45)) {
    return 'mountain'
  }

  if (capitalDistance < 0.26 && noise > 0.68) {
    return 'fortress'
  }

  if (Math.abs(lat) < 14 && noise > 0.48) {
    return 'river'
  }

  if (elevation < 0.3 && noise > 0.56) {
    return 'desert'
  }

  return noise > 0.82 ? 'desert' : 'plains'
}

function buildGeneratedCells(seed: number) {
  const rng = mulberry32(seed)
  const capitalPhase = randomFloat(rng, 0, factionIds.length)
  const capitalPoints = factionIds.map((id, index) => ({
    id,
    point: sphericalFibonacciPoint(index, factionIds.length, capitalPhase),
  }))
  const cells: GeneratedCell[] = []

  for (let index = 0; index < TOTAL_CELLS; index += 1) {
    const point = sphericalFibonacciPoint(index, TOTAL_CELLS, capitalPhase + 0.37)
    const localRng = mulberry32(seed + index * 97 + 13)
    const noise = localRng()
    const nearestCapital = capitalPoints
      .map((capital) => ({
        id: capital.id,
        distance: distanceBetween(point, capital.point),
      }))
      .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))[0]
    const elevation = clamp(
      0.16 +
        noise * 0.62 +
        Math.min(0.18, Math.abs(point.lat) / 180) +
        (nearestCapital?.distance ?? 0) * 0.05,
      0,
      1,
    )
    const terrain = pickTerrain(point.lat, elevation, nearestCapital?.distance ?? 1, noise)

    cells.push({
      id: `hex_${seed.toString(36)}_${index.toString(36)}`,
      owner: nearestCapital?.id ?? 'starlight',
      resourceValue: randomInt(localRng, 18, 96),
      developmentLevel: randomInt(localRng, 1, 5),
      elevation,
      resistance: Number((noise * 0.3).toFixed(2)),
      capturedAtTurn: null,
      centerLatLng: [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))],
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
      hex_id: `hex_${seed.toString(36)}_${index.toString(36)}`,
      terrain,
      minGarrison: terrain === 'fortress' ? 18 : terrain === 'mountain' ? 14 : 10,
      supplyLines: randomInt(localRng, 1, 4),
      neighbors: [],
      factionId: nearestCapital?.id ?? 'starlight',
    })
  }

  const neighborsById = buildNeighbors(cells)
  const cellsWithNeighbors = cells.map((cell) => ({
    ...cell,
    neighbors: neighborsById[cell.id] ?? [],
  }))

  return {
    cells: cellsWithNeighbors,
    capitalPoints,
  }
}

function toRegionEntry(cell: GeneratedCell): RegionEntry {
  return {
    id: cell.id,
    owner: cell.owner,
    resourceValue: cell.resourceValue,
    developmentLevel: cell.developmentLevel,
    elevation: cell.elevation,
    resistance: cell.resistance,
    capturedAtTurn: cell.capturedAtTurn,
    centerLatLng: cell.centerLatLng,
    lat: cell.lat ?? cell.centerLatLng[0],
    lng: cell.lng ?? cell.centerLatLng[1],
    hex_id: cell.hex_id ?? cell.id,
    terrain: cell.terrain,
    minGarrison: cell.minGarrison,
    supplyLines: cell.supplyLines,
    neighbors: cell.neighbors,
  }
}

export function createMockWorldGeometry(seed = DEFAULT_WORLD_GEOMETRY_SEED): WorldGeometryPayload {
  const { cells, capitalPoints } = buildGeneratedCells(seed)

  return {
    seed,
    hex_resolution: HEX_RESOLUTION,
    total_cells: cells.length,
    factions: capitalPoints.map((capital) => {
      const ownedCells = cells.filter((cell) => cell.factionId === capital.id)
      const capitalCell = ownedCells
        .map((cell) => ({
          cell,
          distance: distanceBetween(
            { lat: cell.lat ?? cell.centerLatLng[0], lng: cell.lng ?? cell.centerLatLng[1] },
            capital.point,
          ),
        }))
        .sort((left, right) => left.distance - right.distance || left.cell.id.localeCompare(right.cell.id))[0]

      return {
        id: capital.id,
        capital_hex_id: capitalCell?.cell.hex_id ?? capitalCell?.cell.id ?? '',
        capital_lat: capitalCell?.cell.lat ?? capital.point.lat,
        capital_lng: capitalCell?.cell.lng ?? capital.point.lng,
      }
    }),
    cells: cells.map((cell) => toRegionEntry(cell)),
  }
}
