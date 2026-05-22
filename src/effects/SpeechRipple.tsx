import type { DiplomacyEffect, EffectDrawContext, Vec2 } from './types'
import { clamp, projectPoint, qualityScale, seededUnit } from './types'

export type SpeechRippleParams = {
  origin: Vec2
  color: string
  duration?: number
  maxRadius?: number
}

type RippleParticle = {
  angle: number
  distance: number
  seed: number
}

export class SpeechRipple implements DiplomacyEffect {
  readonly id: string
  active = false
  private origin: Vec2 = { x: 0.5, y: 0.5 }
  private color = '#33AAFF'
  private duration = 2_200
  private elapsed = 0
  private maxRadius = 0.46
  private particles: RippleParticle[] = []

  constructor(id: string) {
    this.id = id
  }

  onSpawn({ origin, color, duration = 2_200, maxRadius = 0.46 }: SpeechRippleParams) {
    this.active = true
    this.origin = origin
    this.color = color
    this.duration = duration
    this.maxRadius = maxRadius
    this.elapsed = 0
    this.particles = Array.from({ length: 42 }, (_, index) => ({
      angle: seededUnit(index + 17) * Math.PI * 2,
      distance: 0.05 + seededUnit(index + 101) * 0.22,
      seed: index + 1,
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
    const fade = 1 - t
    const origin = projectPoint(this.origin, frame)
    const radiusMax = this.maxRadius * frame.mapSize
    const ringOffsets = [0, 0.16, 0.32]

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    for (const [index, offset] of ringOffsets.entries()) {
      const localT = clamp((t - offset) / (1 - offset), 0, 1)
      if (localT <= 0) {
        continue
      }

      const radius = radiusMax * localT
      const alpha = (1 - localT) * (0.46 - index * 0.08) * fade
      ctx.strokeStyle = this.color
      ctx.globalAlpha = alpha
      ctx.lineWidth = Math.max(1, 3 - index)
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2)
      ctx.stroke()

      ctx.globalAlpha = alpha * 0.32
      ctx.lineWidth = 8 - index * 2
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (frame.quality !== 'low') {
      const scale = qualityScale(frame.quality)
      const count = Math.floor(this.particles.length * scale)
      ctx.fillStyle = this.color

      for (let index = 0; index < count; index += 1) {
        const particle = this.particles[index]
        const wobble = Math.sin(frame.time * 0.004 + particle.seed) * 0.018
        const radius = radiusMax * clamp(t - particle.distance + wobble, 0, 1)
        const tail = radiusMax * 0.08 * seededUnit(particle.seed + 44)
        const x = origin.x + Math.cos(particle.angle) * Math.max(0, radius - tail)
        const y = origin.y + Math.sin(particle.angle) * Math.max(0, radius - tail)
        const size = 1 + seededUnit(particle.seed + 7) * 2
        ctx.globalAlpha = fade * (0.22 + seededUnit(particle.seed + 19) * 0.38)
        ctx.fillRect(x, y, size, size)
      }
    }

    ctx.restore()
  }

  onComplete() {
    this.active = false
    this.elapsed = this.duration
  }
}
