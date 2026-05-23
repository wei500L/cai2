import type { MapRegion } from '@/types'

export function haversineDistance(
  origin: [number, number],
  target: [number, number],
) {
  const [lat1, lng1] = origin.map((value) => (value * Math.PI) / 180) as [number, number]
  const [lat2, lng2] = target.map((value) => (value * Math.PI) / 180) as [number, number]
  const latDelta = lat2 - lat1
  const lngDelta = lng2 - lng1
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2

  return 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function buildNeighbors(regions: MapRegion[], maxNeighbors = 6) {
  const candidates = regions.filter((region) => region.owner !== null)
  const neighborsById: Record<string, string[]> = {}

  for (const origin of candidates) {
    const ordered = candidates
      .filter((candidate) => candidate.id !== origin.id)
      .map((candidate) => ({
        id: candidate.id,
        distance: haversineDistance(origin.centerLatLng, candidate.centerLatLng),
      }))
      .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))

    neighborsById[origin.id] = ordered.slice(0, maxNeighbors).map((entry) => entry.id)
  }

  return neighborsById
}
