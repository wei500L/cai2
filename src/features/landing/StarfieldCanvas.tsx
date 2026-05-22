import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    __DIPLOMACY_DEBUG__?: {
      particleDensity?: number
    }
  }
}

export type ParticleAttractor = {
  active: boolean
  x: number
  y: number
}

type StarfieldCanvasProps = {
  attractor: ParticleAttractor
}

type Particle = {
  x: number
  y: number
  z: number
  size: number
  speed: number
  drift: number
  phase: number
  alpha: number
  tint: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

const createParticle = (width: number, height: number): Particle => {
  const z = Math.random()

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    z,
    size: z > 0.9 ? randomRange(2.1, 3.4) : z > 0.72 ? randomRange(1.35, 2.05) : randomRange(0.7, 1.15),
    speed: randomRange(4, 18) * (0.45 + z),
    drift: randomRange(-3, 3),
    phase: randomRange(0, Math.PI * 2),
    alpha: randomRange(0.34, 0.88),
    tint: Math.random(),
  }
}

const resolveDensity = (width: number, height: number) => {
  const mobile = width < 640
  const base = Math.round((width * height) / (mobile ? 650 : 1100))
  const multiplier =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? window.__DIPLOMACY_DEBUG__?.particleDensity ?? 1
      : 1

  return clamp(Math.round(base * multiplier), mobile ? 400 : 800, mobile ? 700 : 1500)
}

export function StarfieldCanvas({ attractor }: StarfieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const pointerRef = useRef({ x: 0, y: 0 })
  const targetPointerRef = useRef({ x: 0, y: 0 })
  const attractorRef = useRef(attractor)
  const hoverStrengthRef = useRef(0)

  useEffect(() => {
    attractorRef.current = attractor
  }, [attractor])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: true })

    if (!canvas || !context) {
      return undefined
    }

    let width = 0
    let height = 0
    let pixelRatio = 1
    let frameId = 0
    let lastTime = performance.now()

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * pixelRatio)
      canvas.height = Math.floor(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      particlesRef.current = Array.from({ length: resolveDensity(width, height) }, () =>
        createParticle(width, height),
      )
    }

    const handlePointerMove = (event: PointerEvent) => {
      targetPointerRef.current = {
        x: (event.clientX / Math.max(width, 1) - 0.5) * 2,
        y: (event.clientY / Math.max(height, 1) - 0.5) * 2,
      }
    }

    const drawNebula = (time: number) => {
      const breath = (Math.sin(time * 0.00032) + 1) * 0.5

      context.fillStyle = '#02040a'
      context.fillRect(0, 0, width, height)

      const hazeA = context.createRadialGradient(width * 0.26, height * 0.34, 0, width * 0.26, height * 0.34, width * 0.7)
      hazeA.addColorStop(0, `rgba(24, 114, 150, ${0.08 + breath * 0.035})`)
      hazeA.addColorStop(0.34, 'rgba(13, 49, 78, 0.05)')
      hazeA.addColorStop(1, 'rgba(2, 4, 10, 0)')
      context.fillStyle = hazeA
      context.fillRect(0, 0, width, height)

      const hazeB = context.createRadialGradient(width * 0.78, height * 0.68, 0, width * 0.78, height * 0.68, width * 0.48)
      hazeB.addColorStop(0, `rgba(96, 74, 148, ${0.055 + breath * 0.025})`)
      hazeB.addColorStop(0.42, 'rgba(16, 24, 66, 0.038)')
      hazeB.addColorStop(1, 'rgba(2, 4, 10, 0)')
      context.fillStyle = hazeB
      context.fillRect(0, 0, width, height)
    }

    const animate = (time: number) => {
      const delta = Math.min(time - lastTime, 42) / 1000
      lastTime = time

      pointerRef.current.x += (targetPointerRef.current.x - pointerRef.current.x) * 0.045
      pointerRef.current.y += (targetPointerRef.current.y - pointerRef.current.y) * 0.045

      const attractorState = attractorRef.current
      hoverStrengthRef.current += ((attractorState.active ? 1 : 0) - hoverStrengthRef.current) * 0.09

      drawNebula(time)

      const desiredCount = resolveDensity(width, height)
      if (particlesRef.current.length !== desiredCount) {
        particlesRef.current = Array.from({ length: desiredCount }, () => createParticle(width, height))
      }

      const particles = particlesRef.current
      const parallaxX = pointerRef.current.x * 18
      const parallaxY = pointerRef.current.y * 12
      const hoverStrength = hoverStrengthRef.current

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index]
        particle.y += particle.speed * delta
        particle.x += particle.drift * delta
        particle.phase += delta * (0.45 + particle.z)

        if (particle.y > height + 8) {
          particle.y = -8
          particle.x = Math.random() * width
        }

        if (particle.x < -8) {
          particle.x = width + 8
        } else if (particle.x > width + 8) {
          particle.x = -8
        }

        let drawX = particle.x + parallaxX * particle.z
        let drawY = particle.y + parallaxY * particle.z

        if (hoverStrength > 0.01) {
          const dx = attractorState.x - drawX
          const dy = attractorState.y - drawY
          const distance = Math.hypot(dx, dy)
          const radius = 230

          if (distance < radius && distance > 0.01) {
            const falloff = (1 - distance / radius) * hoverStrength
            const pull = falloff * 28
            const orbit = falloff * 42 * Math.sin(time * 0.003 + particle.phase)

            drawX += (dx / distance) * pull + (-dy / distance) * orbit
            drawY += (dy / distance) * pull + (dx / distance) * orbit
          }
        }

        const pulse = 0.76 + Math.sin(particle.phase) * 0.18
        const alpha = particle.alpha * pulse * (0.72 + particle.z * 0.38)
        const color =
          particle.tint > 0.82
            ? `rgba(169, 245, 255, ${alpha})`
            : particle.tint > 0.68
              ? `rgba(112, 172, 255, ${alpha})`
              : `rgba(233, 250, 255, ${alpha})`

        context.fillStyle = color
        context.fillRect(Math.round(drawX), Math.round(drawY), particle.size, particle.size)

        if (particle.z > 0.93) {
          context.fillStyle = `rgba(51, 170, 255, ${alpha * 0.22})`
          context.fillRect(Math.round(drawX - 2), Math.round(drawY), particle.size + 4, 1)
        }
      }

      frameId = window.requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />
}
