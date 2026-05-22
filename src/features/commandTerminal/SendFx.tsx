import { useEffect, useRef } from 'react'

export type SendFxMode = 'speech' | 'private' | 'aggressive'

export type SendFxPayload = {
  id: number
  mode: SendFxMode
  text: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  color: string
  glyph: string
}

type SendFxProps = {
  payload: SendFxPayload | null
  onComplete: () => void
}

function createParticles(width: number, height: number, payload: SendFxPayload): Particle[] {
  const count = Math.min(140, Math.max(42, payload.text.length * 3))
  const centerX = width * 0.42
  const centerY = height * 0.62
  const chars = payload.text.replace(/\s/g, '').slice(0, 80) || 'COMMAND'

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / count
    const angle =
      payload.mode === 'speech'
        ? ratio * Math.PI * 2
        : payload.mode === 'private'
          ? -0.42 + (Math.random() - 0.5) * 0.18
          : -0.2 + Math.random() * Math.PI * 1.4
    const speed =
      payload.mode === 'speech'
        ? 120 + Math.random() * 180
        : payload.mode === 'private'
          ? 280 + Math.random() * 170
          : 190 + Math.random() * 260

    return {
      x: centerX + (Math.random() - 0.5) * 160,
      y: centerY + (Math.random() - 0.5) * 36,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + (payload.mode === 'aggressive' ? -40 : 0),
      size: 1 + Math.random() * 2.4,
      life: 1,
      color:
        payload.mode === 'aggressive'
          ? `rgba(255, ${80 + Math.floor(Math.random() * 90)}, 70, `
          : payload.mode === 'private'
            ? 'rgba(102, 255, 214, '
            : 'rgba(80, 190, 255, ',
      glyph: chars[index % chars.length],
    }
  })
}

export function SendFx({ payload, onComplete }: SendFxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const completeRef = useRef(onComplete)

  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!payload) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const parent = canvas?.parentElement

    if (!canvas || !context || !parent) {
      completeRef.current()
      return
    }

    const dpr = window.devicePixelRatio || 1
    const rect = parent.getBoundingClientRect()
    canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const particles = createParticles(rect.width, rect.height, payload)
    const startedAt = performance.now()
    let animationId = 0

    const render = (time: number) => {
      const elapsed = time - startedAt
      const delta = 1 / 60
      const progress = Math.min(1, elapsed / 600)
      context.clearRect(0, 0, rect.width, rect.height)
      context.globalCompositeOperation = 'lighter'
      context.font = '10px "Share Tech Mono", monospace'

      for (const particle of particles) {
        particle.x += particle.vx * delta
        particle.y += particle.vy * delta
        particle.vy += payload.mode === 'speech' ? 0 : 32 * delta
        particle.life = 1 - progress
        context.fillStyle = `${particle.color}${Math.max(0, particle.life)})`
        context.fillRect(particle.x, particle.y, particle.size * 3, particle.size)
        if (particle.size > 2) {
          context.fillText(particle.glyph, particle.x + 4, particle.y + 2)
        }
      }

      if (progress < 1) {
        animationId = requestAnimationFrame(render)
        return
      }

      context.clearRect(0, 0, rect.width, rect.height)
      completeRef.current()
    }

    animationId = requestAnimationFrame(render)

    return () => cancelAnimationFrame(animationId)
  }, [payload])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-20" />
}
