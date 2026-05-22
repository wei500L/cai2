import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

type Tone = 'primary' | 'danger' | 'ghost'

type PixelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
}

const toneStyles: Record<Tone, { border: string; background: string; glow: string }> = {
  primary: {
    border: 'var(--border-glow)',
    background: 'rgba(10, 20, 34, 0.9)',
    glow: 'rgba(51, 170, 255, 0.35)',
  },
  danger: {
    border: 'var(--text-hostile)',
    background: 'rgba(34, 10, 10, 0.92)',
    glow: 'rgba(255, 102, 102, 0.35)',
  },
  ghost: {
    border: 'rgba(255, 255, 255, 0.18)',
    background: 'rgba(255, 255, 255, 0.02)',
    glow: 'rgba(255, 255, 255, 0.1)',
  },
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(function PixelButton(
  {
    tone = 'primary',
    icon,
    children,
    className,
    type = 'button',
    ...props
  },
  ref,
) {
  const style = toneStyles[tone]

  return (
    <motion.button
      ref={ref}
      {...(props as Record<string, unknown>)}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 border px-4 py-2 font-hud text-[0.74rem] uppercase tracking-[0.18em] text-[color:var(--text-primary)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-holo focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--border-glow)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      style={{
        borderColor: style.border,
        background: style.background,
        boxShadow: `0 0 0 1px ${style.border}, 0 0 14px ${style.glow}`,
        '--border-glow': style.border,
      } as CSSProperties}
      whileHover={{
        y: -1,
        boxShadow: `0 0 0 1px ${style.border}, 0 0 20px ${style.glow}`,
      }}
      whileTap={{
        x: [0, -1, 1, -1, 0],
        y: [0, 1, -1, 1, 0],
        scale: 0.985,
      }}
      transition={{ duration: 0.16, ease: 'easeInOut' }}
      >
      {icon ? <span className="inline-flex items-center justify-center">{icon}</span> : null}
      <span className="leading-none">{children}</span>
    </motion.button>
  )
})
