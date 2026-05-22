import type { DiplomacyEffect, EffectDrawContext, Vec2 } from './types'
import { clamp, lerp, projectPoint, qualityScale, seededUnit } from './types'

export type AllianceBridgeParams = {
  a: Vec2
  b: Vec2
  aColor?: string
  bColor?: string
  life?: number
}

type BridgeSpark = {
  phase: number
  offset: number
  bob: number
  size: number
}

export class AllianceBridge implements DiplomacyEffect {
  readonly id: string
  active = false
  private a: Vec2 = { x: 0.5, y: 0.5 }
  private b: Vec2 = { x: 0.5, y: 0.5 }
  private aColor = '#FFFFFF'
  private bColor = '#FFD86B'
  private life = 6_000
  private elapsed = 0
  private sparks: BridgeSpark[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({ a, b, aColor = '#FFFFFF', bColor = '#FFD86B', life = 6_000 }: AllianceBridgeParams) {
    this.active = true
    this.a = a
    this.b = b
    this.aColor = aColor
    this.bColor = bColor
    this.life = life
    this.elapsed = 0
    this.sparks = Array.from({ length: 34 }, (_, index) => ({
      phase: seededUnit(index + 62),
      offset: (seededUnit(index + 118) - 0.5) * 20,
      bob: seededUnit(index + 173) * Math.PI * 2,
      size: 1 + seededUnit(index + 206) * 2.4,
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

    const a = projectPoint(this.a, frame)
    const b = projectPoint(this.b, frame)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const t = clamp(this.elapsed / this.life, 0, 1)
    const fade = 1 - t
    const pulse = (frame.time * 0.00042) % 1

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'butt'

    const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    gradient.addColorStop(0, this.aColor)
    gradient.addColorStop(0.5, '#FFF2B0')
    gradient.addColorStop(1, this.bColor)

    ctx.strokeStyle = gradient
    ctx.globalAlpha = fade * 0.18
    ctx.lineWidth = 18
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    ctx.globalAlpha = fade * 0.62
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    for (let index = 0; index < 3; index += 1) {
      const local = (pulse + index / 3) % 1
      const x = lerp(a.x, b.x, local)
      const y = lerp(a.y, b.y, local)
      ctx.fillStyle = '#FFF2B0'
      ctx.globalAlpha = fade * (1 - Math.abs(local - 0.5)) * 0.7
      ctx.fillRect(x - 5, y - 5, 10, 10)
    }

    if (frame.quality !== 'low') {
      const count = Math.floor(this.sparks.length * qualityScale(frame.quality))
      ctx.fillStyle = '#FFF2B0'

      for (let index = 0; index < count; index += 1) {
        const spark = this.sparks[index]
        const x = lerp(a.x, b.x, spark.phase)
        const y =
          lerp(a.y, b.y, spark.phase) +
          Math.sin(frame.time * 0.006 + spark.bob) * 4 +
          ny * spark.offset
        ctx.globalAlpha = fade * (0.32 + seededUnit(index + 88) * 0.46)
        ctx.fillRect(x + nx * spark.offset, y, spark.size, spark.size)
      }
    }

    ctx.restore()
  }

  onComplete() {
    this.active = false
    this.elapsed = this.life
  }
}
