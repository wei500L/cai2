import type { DiplomacyEffect, EffectDrawContext, Vec2 } from './types'
import { clamp, lerp, projectPoint, qualityScale, seededUnit } from './types'

export type PrivateBeamParams = {
  from: Vec2
  to: Vec2
  color?: string
  life?: number
  density?: number
}

type BeamParticle = {
  phase: number
  offset: number
  speed: number
  size: number
}

export class PrivateBeam implements DiplomacyEffect {
  readonly id: string
  active = false
  private from: Vec2 = { x: 0.5, y: 0.5 }
  private to: Vec2 = { x: 0.5, y: 0.5 }
  private color = '#9933FF'
  private life = 5_000
  private elapsed = 0
  private particles: BeamParticle[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({ from, to, color = '#9933FF', life = 5_000, density = 28 }: PrivateBeamParams) {
    this.active = true
    this.from = from
    this.to = to
    this.color = color
    this.life = life
    this.elapsed = 0
    this.particles = Array.from({ length: density }, (_, index) => ({
      phase: seededUnit(index + 31),
      offset: (seededUnit(index + 89) - 0.5) * 12,
      speed: 0.0012 + seededUnit(index + 144) * 0.0015,
      size: 1 + seededUnit(index + 233) * 2,
    }))
  }

  onUpdate(dt: number) {
    if (!this.active) {
      return false
    }

    this.elapsed += dt
    return this.elapsed < this.life
  }

  draw({ ctx, frame }: EffectDrawContext) {
    if (!this.active) {
      return
    }

    const a = projectPoint(this.from, frame)
    const bBase = projectPoint(this.to, frame)
    const fade = clamp(1 - this.elapsed / this.life, 0, 1)
    const jitter = Math.sin(frame.time * 0.045 + this.elapsed * 0.018) * 3.2 * fade
    const b = {
      x: bBase.x + Math.cos(frame.time * 0.033) * jitter,
      y: bBase.y + Math.sin(frame.time * 0.041) * jitter,
    }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = this.color
    ctx.lineCap = 'butt'

    const glowWidths = [18, 9, 3]
    for (const [index, width] of glowWidths.entries()) {
      ctx.globalAlpha = fade * [0.08, 0.16, 0.62][index]
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    const scale = qualityScale(frame.quality)
    const count = Math.floor(this.particles.length * scale)
    ctx.fillStyle = this.color

    for (let index = 0; index < count; index += 1) {
      const particle = this.particles[index]
      const t = (particle.phase + frame.time * particle.speed) % 1
      const streak = 0.04 + seededUnit(index + 377) * 0.05
      const x = lerp(a.x, b.x, t) + nx * particle.offset
      const y = lerp(a.y, b.y, t) + ny * particle.offset
      ctx.globalAlpha = fade * (0.42 + seededUnit(index + 55) * 0.42)
      ctx.fillRect(x, y, particle.size * 2.4, particle.size)
      ctx.globalAlpha = fade * 0.2
      ctx.fillRect(lerp(a.x, b.x, clamp(t - streak, 0, 1)), lerp(a.y, b.y, clamp(t - streak, 0, 1)), 2, 2)
    }

    ctx.restore()
  }

  onComplete() {
    this.active = false
    this.elapsed = this.life
  }
}
