import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

type BootSequenceProps = {
  onComplete: () => void
}

type BootParticle = {
  sx: number
  sy: number
  tx: number
  ty: number
  size: number
  delay: number
}

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function BootSequence({ onComplete }: BootSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(onComplete, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [onComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return undefined
    }

    let width = 0
    let height = 0
    let pixelRatio = 1
    let frameId = 0
    let particles: BootParticle[] = []
    const start = performance.now()

    const buildParticles = () => {
      const sampleCanvas = document.createElement('canvas')
      const sampleContext = sampleCanvas.getContext('2d')

      if (!sampleContext) {
        particles = []
        return
      }

      sampleCanvas.width = width
      sampleCanvas.height = height
      const fontSize = clamp(width * 0.11, 54, 138)
      sampleContext.fillStyle = '#fff'
      sampleContext.font = `700 ${fontSize}px "Share Tech Mono", "Noto Sans SC", monospace`
      sampleContext.textAlign = 'center'
      sampleContext.textBaseline = 'middle'
      sampleContext.fillText('外交风云', width / 2, height / 2 - fontSize * 0.06)

      const imageData = sampleContext.getImageData(0, 0, width, height).data
      const step = width < 640 ? 8 : 7
      const targets: Array<{ x: number; y: number }> = []

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          if (imageData[(y * width + x) * 4 + 3] > 80 && Math.random() > 0.18) {
            targets.push({ x, y })
          }
        }
      }

      particles = targets.slice(0, width < 640 ? 720 : 1180).map((target) => ({
        sx: Math.random() * width,
        sy: Math.random() * height,
        tx: target.x,
        ty: target.y,
        size: Math.random() > 0.72 ? 2 : 1,
        delay: Math.random() * 0.28,
      }))
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * pixelRatio)
      canvas.height = Math.floor(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      buildParticles()
    }

    const animate = (now: number) => {
      const elapsed = now - start
      const progress = clamp(elapsed / 1800, 0, 1)
      const gather = easeOutCubic(clamp((progress - 0.18) / 0.62, 0, 1))
      const fade = 1 - easeOutCubic(clamp((progress - 0.78) / 0.22, 0, 1))

      context.clearRect(0, 0, width, height)

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index]
        const local = easeOutCubic(clamp((gather - particle.delay) / (1 - particle.delay), 0, 1))
        const jitter = Math.sin(now * 0.018 + index) * (1 - local) * 10
        const x = particle.sx + (particle.tx - particle.sx) * local + jitter
        const y = particle.sy + (particle.ty - particle.sy) * local - jitter * 0.35
        const alpha = clamp(local * 1.25, 0, 1) * fade

        context.fillStyle = `rgba(210, 249, 255, ${alpha})`
        context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size)
      }

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 1.52, duration: 0.28, ease: 'easeOut' }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.18 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />

      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

      <motion.div
        aria-hidden
        className="absolute left-0 right-0 h-[2px] bg-[color:rgba(164,244,255,0.78)] shadow-[0_0_28px_rgba(51,170,255,0.8)]"
        initial={{ y: '-8vh', opacity: 0 }}
        animate={{ y: '108vh', opacity: [0, 1, 0.9, 0] }}
        transition={{ delay: 0.2, duration: 0.62, ease: 'linear' }}
      />

      <motion.div
        aria-hidden
        className="absolute left-5 top-5 h-16 w-16 border-l border-t border-[color:rgba(126,230,255,0.75)] sm:left-10 sm:top-10 sm:h-24 sm:w-24"
        initial={{ x: -40, y: -40, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        aria-hidden
        className="absolute right-5 top-5 h-16 w-16 border-r border-t border-[color:rgba(126,230,255,0.75)] sm:right-10 sm:top-10 sm:h-24 sm:w-24"
        initial={{ x: 40, y: -40, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-5 left-5 h-16 w-16 border-b border-l border-[color:rgba(126,230,255,0.75)] sm:bottom-10 sm:left-10 sm:h-24 sm:w-24"
        initial={{ x: -40, y: 40, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-5 right-5 h-16 w-16 border-b border-r border-[color:rgba(126,230,255,0.75)] sm:bottom-10 sm:right-10 sm:h-24 sm:w-24"
        initial={{ x: 40, y: 40, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.div
        className="absolute bottom-[14vh] left-1/2 -translate-x-1/2 font-hud text-[0.62rem] uppercase tracking-[0.36em] text-[color:rgba(188,240,255,0.72)] sm:text-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.48, ease: 'linear' }}
      >
        LINKING COMMAND SYSTEM
      </motion.div>
    </motion.div>
  )
}
