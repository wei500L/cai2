import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { factionTokens, resolveFactionId } from './hudTheme'

type Tone = 'neutral' | 'warn' | 'hostile' | 'faction'

type GlowPanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone
  factionId?: string
  children: ReactNode
}

const toneTokens: Record<Exclude<Tone, 'faction'>, { border: string; shadow: string }> = {
  neutral: {
    border: 'var(--border-glow)',
    shadow: 'rgba(51, 170, 255, 0.22)',
  },
  warn: {
    border: 'var(--text-warn)',
    shadow: 'rgba(255, 204, 102, 0.22)',
  },
  hostile: {
    border: 'var(--text-hostile)',
    shadow: 'rgba(255, 102, 102, 0.22)',
  },
}

export function GlowPanel({
  tone = 'neutral',
  factionId,
  className,
  children,
  style,
  ...props
}: GlowPanelProps) {
  const faction = resolveFactionId(factionId)
  const resolved =
    tone === 'faction'
      ? faction
        ? {
            border: factionTokens[faction].glow,
            shadow: factionTokens[faction].shadow,
          }
        : toneTokens.neutral
      : toneTokens[tone]

  return (
    <motion.div
      {...(props as Record<string, unknown>)}
      className={clsx(
        'relative overflow-hidden border bg-[color:var(--bg-panel)] text-[color:var(--text-primary)] shadow-glow-sm',
        className,
      )}
      style={
        {
          '--border-glow': resolved.border,
          boxShadow: `0 0 0 1px ${resolved.border}, 0 0 24px ${resolved.shadow}`,
          borderColor: resolved.border,
          ...style,
        } as CSSProperties
      }
      initial={{
        clipPath: 'inset(0 50% 0 50%)',
        opacity: 0,
        scale: 0.985,
      }}
      animate={{
        clipPath: 'inset(0 0% 0 0%)',
        opacity: 1,
        scale: 1,
      }}
      transition={{
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 16%, transparent 84%, rgba(255,255,255,0.04) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.12), transparent 42%)',
        }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}
