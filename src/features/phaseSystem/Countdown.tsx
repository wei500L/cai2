import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { gameStoreApi } from '@/store/gameStore'
import { getRemainingMs } from '@/utils/serverClock'

type CountdownProps = {
  remainingMs?: number
  className?: string
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function readRemainingMs(fallback = 0) {
  const { epoch } = gameStoreApi.getState()
  if (!Number.isFinite(epoch.phaseStartedAt) || !Number.isFinite(epoch.phaseDurationMs)) {
    return fallback
  }

  return Math.max(0, getRemainingMs(epoch.phaseStartedAt, epoch.phaseDurationMs))
}

export function Countdown({ remainingMs = 0, className }: CountdownProps) {
  const [displayRemainingMs, setDisplayRemainingMs] = useState(() => readRemainingMs(remainingMs))

  useEffect(() => {
    let frameId = 0
    const frame = () => {
      setDisplayRemainingMs(readRemainingMs(remainingMs))
      frameId = window.requestAnimationFrame(frame)
    }

    frameId = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(frameId)
  }, [remainingMs])

  const clampedRemainingMs = Math.max(0, displayRemainingMs)
  const totalSeconds = Math.max(0, Math.ceil(clampedRemainingMs / 1_000))
  const critical = totalSeconds > 0 && totalSeconds < 10
  const bars = Array.from({ length: 10 }, (_, index) => index < Math.max(0, Math.ceil(totalSeconds)))

  return (
    <motion.div
      className={clsx(
        'relative flex h-9 min-w-[8.5rem] items-center justify-center overflow-hidden border px-3',
        critical
          ? 'border-[color:rgba(255,102,102,0.72)] bg-[color:rgba(70,8,12,0.62)]'
          : 'border-[color:rgba(51,170,255,0.32)] bg-[color:rgba(6,14,26,0.72)]',
        className,
      )}
      animate={
        critical
          ? {
              scale: [1, 1.035, 1],
              boxShadow: [
                '0 0 0 1px rgba(255,102,102,0.42), 0 0 10px rgba(255,32,32,0.18)',
                '0 0 0 1px rgba(255,102,102,0.9), 0 0 28px rgba(255,32,32,0.46)',
                '0 0 0 1px rgba(255,102,102,0.42), 0 0 10px rgba(255,32,32,0.18)',
              ],
            }
          : {
              scale: 1,
              boxShadow: '0 0 0 1px rgba(51,170,255,0.3), 0 0 14px rgba(51,170,255,0.16)',
            }
      }
      transition={critical ? { duration: 0.82, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.18 }}
    >
      <div
        aria-hidden
        className="absolute inset-x-2 top-1 flex justify-between gap-1"
      >
        {bars.map((active, index) => (
          <span
            key={index}
            className={clsx(
              'h-[2px] flex-1',
              active
                ? critical
                  ? 'bg-[color:rgba(255,102,102,0.95)]'
                  : 'bg-[color:rgba(51,170,255,0.72)]'
                : 'bg-[color:rgba(255,255,255,0.1)]',
            )}
          />
        ))}
      </div>
      <motion.span
        className={clsx(
          'relative z-10 font-mono text-[0.92rem] leading-none',
          critical ? 'text-[color:rgb(255,118,118)]' : 'text-[color:var(--hud-faction-glow)]',
        )}
        animate={critical ? { opacity: [1, 0.62, 1], filter: ['blur(0)', 'blur(0.8px)', 'blur(0)'] } : undefined}
        transition={critical ? { duration: 0.42, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        {formatCountdown(clampedRemainingMs)}
      </motion.span>
      {critical ? (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-8 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]"
          animate={{ x: ['-3rem', '9rem'] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}
    </motion.div>
  )
}
