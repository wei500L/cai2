import type { HTMLAttributes } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

type HoloDividerProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
}

export function HoloDivider({
  orientation = 'horizontal',
  className,
  ...props
}: HoloDividerProps) {
  const vertical = orientation === 'vertical'

  return (
    <div
      {...props}
      aria-hidden
      className={clsx(
        'relative overflow-hidden',
        vertical ? 'h-full w-px' : 'h-px w-full',
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(51, 170, 255, 0.14)',
        }}
      />
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: vertical
            ? 'linear-gradient(180deg, transparent 0%, var(--border-glow) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, var(--border-glow) 50%, transparent 100%)',
          backgroundSize: vertical ? '100% 200%' : '200% 100%',
        }}
        animate={
          vertical
            ? { backgroundPositionY: ['0%', '200%'] }
            : { backgroundPositionX: ['0%', '200%'] }
        }
        transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

