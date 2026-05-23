import { describe, expect, it } from 'vitest'
import { factionIds } from '@/components/hudTheme'
import { createMockWorldGeometry } from '../worldGeometry'

describe('createMockWorldGeometry', () => {
  it('generates deterministic backend-shaped spherical cells', () => {
    const first = createMockWorldGeometry(1234)
    const second = createMockWorldGeometry(1234)

    expect(first.seed).toBe(1234)
    expect(first.hex_resolution).toBe(4)
    expect(first.total_cells).toBe(700)
    expect(first.factions).toHaveLength(factionIds.length)
    expect(first.cells).toHaveLength(first.total_cells)
    expect(first.cells.slice(0, 12)).toEqual(second.cells.slice(0, 12))
    expect(first.factions).toEqual(second.factions)

    const owners = new Set(first.cells.map((cell) => cell.owner))
    for (const factionId of factionIds) {
      expect(owners.has(factionId)).toBe(true)
    }

    for (const cell of first.cells.slice(0, 20)) {
      expect(typeof cell.lat).toBe('number')
      expect(typeof cell.lng).toBe('number')
      expect(cell.hex_id).toMatch(/^hex_/)
      expect(cell.elevation).toBeGreaterThanOrEqual(0)
      expect(cell.elevation).toBeLessThanOrEqual(1)
      expect(cell.neighbors.length).toBeGreaterThan(0)
    }
  })
})
