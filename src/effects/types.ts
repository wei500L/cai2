import type { MapQuality } from '@/store/uiStore'

export type Vec2 = {
  x: number
  y: number
}

export type MapRenderFrame = {
  width: number
  height: number
  mapX: number
  mapY: number
  mapSize: number
  time: number
  quality: MapQuality
}

export type EffectDrawContext = {
  ctx: CanvasRenderingContext2D
  frame: MapRenderFrame
}

export type DiplomacyEffect = {
  readonly id: string
  active: boolean
  onUpdate: (dt: number) => boolean
  draw: (context: EffectDrawContext) => void
  onComplete: () => void
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function projectPoint(point: Vec2, frame: MapRenderFrame): Vec2 {
  return {
    x: frame.mapX + point.x * frame.mapSize,
    y: frame.mapY + point.y * frame.mapSize,
  }
}

export function qualityScale(quality: MapQuality) {
  if (quality === 'low') {
    return 0.42
  }

  if (quality === 'mid') {
    return 0.62
  }

  return 1
}

export function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43_758.5453
  return value - Math.floor(value)
}

export function quadraticPoint(a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 {
  const mt = 1 - t
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  }
}
