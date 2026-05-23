import { Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createStarfield, disposeStarfield } from '../starfield'

describe('starfield', () => {
  it('injects the starfield, builds the requested count and disposes cleanly', () => {
    const scene = new Scene()
    const points = createStarfield(scene, 0.7)
    const geometry = points.geometry
    const material = points.material

    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')

    expect(scene.children).toContain(points)
    expect(geometry.getAttribute('position').count).toBe(8000)
    expect(geometry.getAttribute('color').count).toBe(8000)
    expect((material as { sizeAttenuation: boolean }).sizeAttenuation).toBe(false)

    disposeStarfield(points)

    expect(scene.children).toHaveLength(0)
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
  })
})
