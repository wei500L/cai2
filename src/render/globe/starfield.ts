import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Scene,
} from 'three'

const BASE_COUNT = 8000 / 0.7
const STAR_RADIUS = 800

const STAR_TONES = [
  new Color('#ffffff'),
  new Color('#cfe4ff'),
  new Color('#fff0b9'),
  new Color('#ffb7b7'),
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hash(index: number) {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function fibPoint(index: number, count: number, radius: number) {
  const offset = 2 / count
  const increment = Math.PI * (3 - Math.sqrt(5))
  const y = ((index * offset) - 1) + offset / 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const phi = index * increment

  return [
    Math.cos(phi) * r * radius,
    y * radius,
    Math.sin(phi) * r * radius,
  ] as const
}

export function createStarfield(scene: Scene, density: number) {
  const count = Math.max(0, Math.round(BASE_COUNT * clamp(density, 0, 1)))
  const geometry = new BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = fibPoint(index, Math.max(count, 1), STAR_RADIUS)
    const color = STAR_TONES[Math.floor(hash(index) * STAR_TONES.length) % STAR_TONES.length]
    positions[index * 3] = x
    positions[index * 3 + 1] = y
    positions[index * 3 + 2] = z
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))

  const material = new PointsMaterial({
    size: 1.35,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = -1000
  scene.add(points)

  return points
}

export function disposeStarfield(points: Points | null) {
  if (!points) {
    return
  }

  points.removeFromParent()
  points.geometry.dispose()
  const material = points.material
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
}
