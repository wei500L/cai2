import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { PixelButton } from '@/components/PixelButton'

const COUNTDOWN_MS = 8_000

type NextEpochButtonProps = {
  onNext: () => void
  disabled?: boolean
}

export function NextEpochButton({ onNext, disabled = false }: NextEpochButtonProps) {
  const [remainingMs, setRemainingMs] = useState(COUNTDOWN_MS)
  const firedRef = useRef(false)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const nextRemaining = Math.max(0, COUNTDOWN_MS - (Date.now() - startedAt))
      setRemainingMs(nextRemaining)

      if (nextRemaining <= 0 && !firedRef.current) {
        firedRef.current = true
        onNext()
      }
    }, 100)

    return () => window.clearInterval(timer)
  }, [onNext])

  const seconds = Math.ceil(remainingMs / 1000)
  const progress = Math.max(0, Math.min(1, remainingMs / COUNTDOWN_MS))

  const handleClick = () => {
    if (disabled || firedRef.current) {
      return
    }

    firedRef.current = true
    onNext()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, delay: 1.34, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto mx-auto mt-3 flex flex-col items-center gap-2"
    >
      <motion.div
        aria-hidden
        className="h-1 w-[min(18rem,70vw)] border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(0,0,0,0.42)]"
        animate={{
          boxShadow: [
            '0 0 8px rgba(255,204,102,0.14)',
            '0 0 24px rgba(255,204,102,0.34)',
            '0 0 8px rgba(255,204,102,0.14)',
          ],
        }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          className="h-full bg-[linear-gradient(90deg,rgba(255,204,102,0.28),rgba(255,231,184,0.92))]"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1, ease: 'linear' }}
        />
      </motion.div>
      <PixelButton
        tone="primary"
        disabled={disabled}
        onClick={handleClick}
        className="min-w-[14rem] border-[color:rgba(255,204,102,0.58)] bg-[color:rgba(36,18,6,0.88)] px-5 py-3 text-[0.72rem] tracking-[0.2em]"
      >
        进入下一纪元 · {seconds}
      </PixelButton>
    </motion.div>
  )
}
