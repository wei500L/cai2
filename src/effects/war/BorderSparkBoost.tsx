import type { DiplomacyEffect, EffectDrawContext, Vec2 } from '@/effects/types'
import { clamp, lerp, projectPoint, seededUnit } from '@/effects/types'

export type BorderSparkBoostParams = {
  from: Vec2
  to: Vec2
  attackerColor?: string
  defenderColor?: string
  density?: number
  persist?: boolean
  life?: number
}

type Spark = {
  lane: number
  phase: number
  speed: number
  size: number
}

export class BorderSparkBoost implements DiplomacyEffect {
  readonly id: string
  active = false
  persist = true
  private from: Vec2 = { x: 0.5, y: 0.5 }
  private to: Vec2 = { x: 0.5, y: 0.5 }
  private attackerColor = '#ff3333'
  private defenderColor = '#33aaff'
  private elapsed = 0
  private life = 800
  private sparks: Spark[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({
    from,
    to,
    attackerColor = '#ff3333',
    defenderColor = '#33aaff',
    density = 46,
    persist = true,
    life = 800,
  }: BorderSparkBoostParams) {
    this.active = true
    this.persist = persist
    this.from = from
    this.to = to
    this.attackerColor = attackerColor
    this.defenderColor = defenderColor
    this.elapsed = 0
    this.life = life
    this.sparks = Array.from({ length: density }, (_, index) => ({
      lane: (seededUnit(index + 1701) - 0.5) * 24,
      phase: seededUnit(index + 123),
      speed: 0.00065 + seededUnit(index + 937) * 0.0015,
      size: 1.2 + seededUnit(index + 411) * 2.4,
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
    const pulse = 0.55 + Math.sin(frame.time * 0.018) * 0.45
    const lifeFade = this.persist ? 1 : clamp(1 - this.elapsed / this.life, 0, 1)
    const qualityScale = frame.quality === 'low' ? 0.25 : frame.quality === 'mid' ? 0.62 : 1
    const count = Math.floor(this.sparks.length * qualityScale)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'square'
    ctx.strokeStyle = 'rgba(255, 56, 48, 0.32)'
    ctx.lineWidth = 5 + pulse * 3
    ctx.shadowColor = 'rgba(255, 48, 42, 0.8)'
    ctx.shadowBlur = 12
    ctx.globalAlpha = (0.36 + pulse * 0.24) * lifeFade
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    for (let index = 0; index < count; index += 1) {
      const spark = this.sparks[index]
      const outward = index % 2 === 0 ? 1 : -1
      const phase = (spark.phase + frame.time * spark.speed * (this.persist ? 0.55 : 1.35)) % 1
      const collision = 1 - Math.abs(phase - 0.5) * 2
      const x = lerp(a.x, b.x, phase) + nx * spark.lane * (0.7 + collision)
      const y = lerp(a.y, b.y, phase) + ny * spark.lane * (0.7 + collision)
      ctx.globalAlpha = (0.28 + collision * 0.58) * lifeFade
      ctx.fillStyle = outward > 0 ? this.attackerColor : this.defenderColor
      ctx.fillRect(x, y, spark.size * (1.4 + collision), spark.size * (1.4 + collision))
    }

    ctx.restore()
  }

  onComplete() {
    this.active = false
    this.elapsed = this.life
  }
}
