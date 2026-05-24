import type { DiplomacyEffect, EffectDrawContext, Vec2 } from './types'
import { clamp, lerp, projectPoint, quadraticPoint, qualityScale, seededUnit } from './types'

export type TradeArcParams = {
  from: Vec2
  to: Vec2
  density?: number
  persist?: boolean
  life?: number
}

type ArcParticle = {
  phase: number
  speed: number
  offset: number
  size: number
}

function colorAt(t: number) {
  const start = [204, 170, 51]
  const end = [255, 216, 107]
  const r = Math.round(lerp(start[0], end[0], t))
  const g = Math.round(lerp(start[1], end[1], t))
  const b = Math.round(lerp(start[2], end[2], t))
  return `rgb(${r}, ${g}, ${b})`
}

export class TradeArc implements DiplomacyEffect {
  readonly id: string
  active = false
  persist = true
  private from: Vec2 = { x: 0.5, y: 0.5 }
  private to: Vec2 = { x: 0.5, y: 0.5 }
  private elapsed = 0
  private life = 8_000
  private particles: ArcParticle[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({ from, to, density = 20, persist = true, life = 8_000 }: TradeArcParams) {
    this.active = true
    this.persist = persist
    this.from = from
    this.to = to
    this.elapsed = 0
    this.life = life
    this.particles = Array.from({ length: density }, (_, index) => ({
      phase: seededUnit(index + 43),
      speed: 0.00022 + seededUnit(index + 211) * 0.00018,
      offset: (seededUnit(index + 91) - 0.5) * 8,
      size: 1.5 + seededUnit(index + 154) * 2.2,
    }))
  }

  onUpdate(dt: number) {
    if (!this.active) {
      return false
    }

    this.elapsed += dt
    return this.persist || this.elapsed < this.life
  }

  draw({ ctx, frame }: EffectDrawContext) {
    if (!this.active) {
      return
    }

    const a = projectPoint(this.from, frame)
    const b = projectPoint(this.to, frame)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const height = clamp(length * 0.34, 38, frame.mapSize * 0.2)
    const control = {
      x: (a.x + b.x) / 2 + nx * height,
      y: (a.y + b.y) / 2 + ny * height,
    }
    const fade = this.persist ? 1 : clamp(1 - this.elapsed / this.life, 0, 1)

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#CCAA33'
    ctx.globalAlpha = 0.08 * fade
    ctx.lineWidth = 5
    this.traceArc(ctx, a, control, b)
    ctx.stroke()

    ctx.strokeStyle = '#FFD86B'
    ctx.globalAlpha = 0.26 * fade
    ctx.lineWidth = 1.6
    this.traceArc(ctx, a, control, b)
    ctx.stroke()

    const count = Math.floor(this.particles.length * qualityScale(frame.quality))
    for (let index = 0; index < count; index += 1) {
      const particle = this.particles[index]
      this.drawParticle(ctx, a, control, b, particle, frame.time, fade, 1)
      this.drawParticle(ctx, a, control, b, particle, frame.time, fade, -1)
    }

    ctx.restore()
  }

  private traceArc(ctx: CanvasRenderingContext2D, a: Vec2, c: Vec2, b: Vec2) {
    ctx.beginPath()
    for (let index = 0; index <= 20; index += 1) {
      const point = quadraticPoint(a, c, b, index / 20)
      if (index === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineTo(point.x, point.y)
      }
    }
  }

  private drawParticle(
    ctx: CanvasRenderingContext2D,
    a: Vec2,
    c: Vec2,
    b: Vec2,
    particle: ArcParticle,
    time: number,
    fade: number,
    direction: 1 | -1,
  ) {
    const phase = (particle.phase + time * particle.speed) % 1
    const t = direction > 0 ? phase : 1 - phase
    const point = quadraticPoint(a, c, b, t)
    const next = quadraticPoint(a, c, b, clamp(t + 0.01, 0, 1))
    const dx = next.x - point.x
    const dy = next.y - point.y
    const length = Math.hypot(dx, dy) || 1
    const x = point.x + (-dy / length) * particle.offset
    const y = point.y + (dx / length) * particle.offset

    ctx.fillStyle = colorAt(t)
    ctx.globalAlpha = fade * (0.28 + seededUnit(particle.phase * 400) * 0.22)
    ctx.beginPath()
    ctx.arc(x, y, particle.size * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }

  onComplete() {
    this.active = false
    this.elapsed = this.life
  }
}
