import { describe, expect, it } from 'vitest'
import { createInitialState } from '@/mock/initialState'
import { buildNeighbors, haversineDistance } from '../buildNeighbors'

describe('buildNeighbors', () => {
  it('returns nearest neighbors deterministically for mock regions', () => {
    const regions = createInitialState(42).regions.map((region) => ({
      ...region,
      neighbors: [],
    }))
    const neighbors = buildNeighbors(regions)

    for (const region of regions) {
      const expected = [...regions]
        .filter((candidate) => candidate.id !== region.id)
        .map((candidate) => ({
          id: candidate.id,
          distance: haversineDistance(region.centerLatLng, candidate.centerLatLng),
        }))
        .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
        .slice(0, 6)
        .map((entry) => entry.id)

      expect(neighbors[region.id]).toEqual(expected)
      expect(neighbors[region.id].length).toBeGreaterThanOrEqual(4)
      expect(neighbors[region.id].length).toBeLessThanOrEqual(6)
      expect(new Set(neighbors[region.id]).size).toBe(neighbors[region.id].length)
      expect(neighbors[region.id]).not.toContain(region.id)
    }
  })
})
