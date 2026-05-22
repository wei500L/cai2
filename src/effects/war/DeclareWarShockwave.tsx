import type { DiplomacyEffect, EffectDrawContext, Vec2 } from '@/effects/types'
import { clamp, lerp, projectPoint, seededUnit } from '@/effects/types'

export type DeclareWarShockwaveParams = {
  from: Vec2
  to: Vec2
  regionId?: string
  attackerColor?: string
  defenderColor?: string
  duration?: number
}

type RiftSpark = {
  phase: number
  offset: number
  speed: number
  size: number
}

export class DeclareWarShockwave implements DiplomacyEffect {
  readonly id: string
  active = false
  private from: Vec2 = { x: 0.5, y: 0.5 }
  private to: Vec2 = { x: 0.5, y: 0.5 }
  private attackerColor = '#ff3333'
  private defenderColor = '#33aaff'
  private elapsed = 0
  private duration = 5_000
  private sparks: RiftSpark[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({
    from,
    to,
    attackerColor = '#ff3333',
    defenderColor = '#33aaff',
    duration = 5_000,
  }: DeclareWarShockwaveParams) {
    this.active = true
    this.from = from
    this.to = to
    this.attackerColor = attackerColor
    this.defenderColor = defenderColor
    this.elapsed = 0
    this.duration = duration
    this.sparks = Array.from({ length: 96 }, (_, index) => ({
      phase: seededUnit(index + 701),
      offset: (seededUnit(index + 977) - 0.5) * 34,
      speed: 0.0012 + seededUnit(index + 863) * 0.0028,
      size: 1.4 + seededUnit(index + 421) * 3.4,
    }))
  }

  onUpdate(dt: number) {
    if (!this.active) {
      return false
    }

    this.elapsed += dt
    return this.elapsed < this.duration
  }

  draw({ ctx, frame }: EffectDrawContext) {
    if (!this.active) {
      return
    }

    const t = clamp(this.elapsed / this.duration, 0, 1)
    const a = projectPoint(this.from, frame)
    const b = projectPoint(this.to, frame)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }
    const crackGrowth = clamp((t - 0.18) / 0.24, 0, 1)
    const energy = clamp(1 - Math.abs(t - 0.36) / 0.34, 0, 1)
    const stable = clamp((t - 0.5) / 0.2, 0, 1)
    const fade = clamp(1 - (t - 0.82) / 0.18, 0, 1)
    const jitter = t < 0.5 ? (1 - t * 1.5) * 8 : 1.5

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'square'

    const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    gradient.addColorStop(0, this.attackerColor)
    gradient.addColorStop(0.5, '#ff1f2d')
    gradient.addColorStop(1, this.defenderColor)

    ctx.strokeStyle = 'rgba(255, 42, 36, 0.18)'
    ctx.lineWidth = lerp(10, 26, energy) * fade
    ctx.shadowColor = '#ff302a'
    ctx.shadowBlur = 26 * energy
    this.traceRift(ctx, a, b, nx, ny, crackGrowth, jitter, 0)
    ctx.stroke()

    ctx.strokeStyle = gradient
    ctx.globalAlpha = (0.42 + energy * 0.36) * fade
    ctx.lineWidth = lerp(2, 5, stable)
    this.traceRift(ctx, a, b, nx, ny, crackGrowth, jitter, 19)
    ctx.stroke()

    if (t > 0.2) {
      const waveProgress = clamp((t - 0.3) / 0.36, 0, 1)
      for (let ring = 0; ring < 3; ring += 1) {
        const ringT = clamp(waveProgress - ring * 0.16, 0, 1)
        if (ringT <= 0) {
          continue
        }
        ctx.globalAlpha = (1 - ringT) * 0.44 * fade
        ctx.strokeStyle = ring === 0 ? '#ff3333' : this.attackerColor
        ctx.lineWidth = 2 + ring * 1.2
        ctx.beginPath()
        ctx.arc(mid.x, mid.y, frame.mapSize * (0.08 + ringT * 0.44), 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const sparkCount = Math.floor(this.sparks.length * (frame.quality === 'low' ? 0.35 : frame.quality === 'mid' ? 0.65 : 1))
    for (let index = 0; index < sparkCount; index += 1) {
      const spark = this.sparks[index]
      const phase = (spark.phase + frame.time * spark.speed) % 1
      const centerT = clamp(phase, 0, 1)
      const x = lerp(a.x, b.x, centerT) + nx * spark.offset * (0.7 + energy)
      const y = lerp(a.y, b.y, centerT) + ny * spark.offset * (0.7 + energy)
      ctx.globalAlpha = (0.18 + energy * 0.62) * fade
      ctx.fillStyle = index % 3 === 0 ? '#ffffff' : index % 2 === 0 ? '#ff3333' : this.attackerColor
      ctx.fillRect(x, y, spark.size * (1 + energy), spark.size * 0.8)
    }

    ctx.restore()
  }

  private traceRift(
    ctx: CanvasRenderingContext2D,
    a: Vec2,
    b: Vec2,
    nx: number,
    ny: number,
    growth: number,
    jitter: number,
    seedOffset: number,
  ) {
    ctx.beginPath()
    const steps = 20
    const start = 0.5 - growth * 0.5
    const end = 0.5 + growth * 0.5
    for (let index = 0; index <= steps; index += 1) {
      const p = start + (end - start) * (index / steps)
      const crack = (seededUnit(index + seedOffset + 31) - 0.5) * jitter
      const x = lerp(a.x, b.x, p) + nx * crack
      const y = lerp(a.y, b.y, p) + ny * crack
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
  }

  onComplete() {
    this.active = false
    this.elapsed = this.duration
  }
}
