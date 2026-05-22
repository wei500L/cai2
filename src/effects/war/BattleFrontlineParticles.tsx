import type { DiplomacyEffect, EffectDrawContext, Vec2 } from '@/effects/types'
import { clamp, lerp, projectPoint, seededUnit } from '@/effects/types'

export type BattleFrontlineParticlesParams = {
  from: Vec2
  to: Vec2
  attackerColor?: string
  defenderColor?: string
  density?: number
}

type FrontlineParticle = {
  phase: number
  lane: number
  drift: number
  size: number
  smoke: boolean
}

export class BattleFrontlineParticles implements DiplomacyEffect {
  readonly id: string
  active = false
  private from: Vec2 = { x: 0.5, y: 0.5 }
  private to: Vec2 = { x: 0.5, y: 0.5 }
  private attackerColor = '#ff3333'
  private defenderColor = '#33aaff'
  private particles: FrontlineParticle[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({
    from,
    to,
    attackerColor = '#ff3333',
    defenderColor = '#33aaff',
    density = 32,
  }: BattleFrontlineParticlesParams) {
    this.active = true
    this.from = from
    this.to = to
    this.attackerColor = attackerColor
    this.defenderColor = defenderColor
    this.particles = Array.from({ length: density }, (_, index) => ({
      phase: seededUnit(index + 2901),
      lane: (seededUnit(index + 891) - 0.5) * 30,
      drift: seededUnit(index + 661) * 0.00028,
      size: 1.4 + seededUnit(index + 231) * 4.2,
      smoke: index % 3 === 0,
    }))
  }

  onUpdate(_dt: number) {
    return this.active
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
    const count = Math.floor(this.particles.length * (frame.quality === 'low' ? 0.25 : frame.quality === 'mid' ? 0.58 : 1))

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let index = 0; index < count; index += 1) {
      const particle = this.particles[index]
      const wave = (particle.phase + frame.time * particle.drift) % 1
      const t = clamp(wave, 0.04, 0.96)
      const sidePulse = Math.sin(frame.time * 0.004 + index) * 5
      const x = lerp(a.x, b.x, t) + nx * (particle.lane + sidePulse)
      const y = lerp(a.y, b.y, t) + ny * (particle.lane + sidePulse)

      if (particle.smoke) {
        ctx.globalAlpha = 0.05 + Math.sin(frame.time * 0.002 + index) * 0.025
        ctx.fillStyle = 'rgba(130, 116, 105, 0.82)'
        ctx.fillRect(x, y, particle.size * 3.2, particle.size * 2.2)
      } else {
        ctx.globalAlpha = 0.24 + Math.sin(frame.time * 0.006 + index) * 0.18
        ctx.fillStyle = index % 2 === 0 ? this.attackerColor : this.defenderColor
        ctx.fillRect(x, y, particle.size * 1.6, particle.size * 1.2)
      }
    }
    ctx.restore()
  }

  onComplete() {
    this.active = false
  }
}
