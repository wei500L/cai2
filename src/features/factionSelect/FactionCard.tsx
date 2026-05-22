import { forwardRef, useMemo, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import type { FactionMeta } from '@/mock/factions'

type FactionCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  faction: FactionMeta
  selected: boolean
  active: boolean
  onFocusCard: () => void
  onSelectCard: () => void
}

const particleAngles = [18, 86, 154, 228, 302, 336]
const cardParticlePoints = [
  { left: '8%', top: '0%', x: 10, y: -4 },
  { left: '38%', top: '0%', x: -8, y: -5 },
  { left: '72%', top: '0%', x: 7, y: -4 },
  { left: '100%', top: '24%', x: 5, y: 10 },
  { left: '100%', top: '70%', x: 6, y: -8 },
  { left: '64%', top: '100%', x: -8, y: 5 },
  { left: '25%', top: '100%', x: 8, y: 5 },
  { left: '0%', top: '54%', x: -5, y: -8 },
]

function Sigil({ faction, energized }: { faction: FactionMeta; energized: boolean }) {
  const orbitDuration = energized ? 5.2 : 9.5
  const pulseDuration = energized ? 1.4 : 2.4

  return (
    <div
      className="relative grid aspect-square h-24 place-items-center overflow-hidden border border-[color:var(--faction-glow)] bg-[color:rgba(5,9,18,0.92)]"
      style={
        {
          boxShadow: `0 0 0 1px ${faction.glow}, 0 0 22px ${faction.shadow}`,
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="absolute inset-[10%] border border-[color:color-mix(in srgb, var(--faction-glow) 58%, transparent)]"
        style={{
          background:
            'radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--faction-primary) 60%, transparent) 0%, transparent 58%)',
        }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-[18%] border border-[color:var(--faction-glow)]"
        animate={{ rotate: 360 }}
        transition={{ duration: orbitDuration, repeat: Infinity, ease: 'linear' }}
      />
      {particleAngles.map((angle, index) => (
        <motion.span
          key={angle}
          aria-hidden
          className="absolute block h-1.5 w-1.5 rounded-none"
          style={{
            left: '50%',
            top: '50%',
            background: index % 2 === 0 ? faction.glow : faction.primary,
            boxShadow: `0 0 12px ${index % 2 === 0 ? faction.glow : faction.shadow}`,
            transform: `rotate(${angle}deg) translateX(28px)`,
            transformOrigin: '0 0',
          }}
          animate={{
            opacity: energized ? [0.45, 1, 0.45] : [0.25, 0.75, 0.25],
            scale: energized ? [0.85, 1.15, 0.85] : [0.75, 1, 0.75],
          }}
          transition={{
            duration: pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.07,
          }}
        />
      ))}
      <div
        className="absolute inset-[28%] border border-[color:color-mix(in srgb, var(--faction-primary) 72%, transparent)]"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--faction-primary) 72%, transparent) 0%, color-mix(in srgb, var(--faction-shadow) 48%, transparent) 58%, transparent 80%)',
          boxShadow: `inset 0 0 14px ${faction.shadow}, 0 0 18px ${faction.glow}`,
        }}
      />
      {Array.from({ length: 4 }).map((_, index) => (
        <motion.span
          key={`${faction.id}-core-${index}`}
          aria-hidden
          className="absolute h-1 w-1 rounded-none"
          style={{
            left: `${38 + index * 8}%`,
            top: `${34 + (index % 2) * 16}%`,
            background: index % 2 === 0 ? faction.primary : faction.glow,
            boxShadow: `0 0 10px ${index % 2 === 0 ? faction.glow : faction.shadow}`,
          }}
          animate={{
            opacity: energized ? [0.35, 1, 0.35] : [0.2, 0.55, 0.2],
            y: energized ? [0, -2, 0] : [0, -1, 0],
          }}
          transition={{
            duration: energized ? 1.8 : 2.8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.12,
          }}
        />
      ))}
    </div>
  )
}

export const FactionCard = forwardRef<HTMLButtonElement, FactionCardProps>(function FactionCard(
  { faction, selected, active, onFocusCard, onSelectCard, className, ...props },
  ref,
) {
  const [hovered, setHovered] = useState(false)
  const energized = hovered || selected
  const badgeLabel = useMemo(() => (selected ? 'LOCKED' : active ? 'ACTIVE' : 'IDLE'), [active, selected])

  return (
    <motion.button
      ref={ref}
      {...(props as Record<string, unknown>)}
      type="button"
      tabIndex={active ? 0 : -1}
      aria-pressed={selected}
      onFocus={onFocusCard}
      onClick={onSelectCard}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={clsx(
        'group relative flex min-h-[18rem] flex-col overflow-hidden border bg-[color:rgba(6,10,20,0.92)] p-4 text-left outline-none transition-[border-color,box-shadow,transform,background-color] duration-200',
        'focus-visible:ring-1 focus-visible:ring-[color:var(--faction-glow)]',
        className,
      )}
      style={
        {
          '--faction-primary': faction.primary,
          '--faction-glow': faction.glow,
          '--faction-shadow': faction.shadow,
          borderColor: selected ? faction.glow : 'rgba(96, 126, 160, 0.22)',
          boxShadow: selected
            ? `0 0 0 1px ${faction.glow}, 0 0 26px ${faction.shadow}`
            : energized
              ? `0 0 0 1px ${faction.primary}, 0 0 18px ${faction.shadow}`
              : '0 0 0 1px rgba(96, 126, 160, 0.14)',
        } as CSSProperties
      }
      animate={{
        y: selected ? -2 : 0,
        scale: selected ? 1.02 : 1,
      }}
      whileHover={{
        y: -3,
      }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        animate={
          energized
            ? { x: ['-135%', '135%'], opacity: [0, 0.8, 0] }
            : { x: '-135%', opacity: [0, 0.35, 0] }
        }
        transition={{
          duration: energized ? 1.3 : 2.4,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          background:
            'linear-gradient(110deg, transparent 0%, color-mix(in srgb, var(--faction-glow) 34%, transparent) 45%, color-mix(in srgb, var(--faction-primary) 56%, transparent) 52%, transparent 65%)',
        }}
      />
      {cardParticlePoints.map((point, index) => (
        <motion.span
          key={`${faction.id}-edge-${index}`}
          aria-hidden
          className="pointer-events-none absolute h-1 w-1 rounded-none opacity-0"
          style={{
            left: point.left,
            top: point.top,
            background: index % 2 === 0 ? faction.glow : faction.primary,
            boxShadow: `0 0 12px ${index % 2 === 0 ? faction.glow : faction.shadow}`,
          }}
          animate={
            energized
              ? {
                  opacity: [0.1, 0.85, 0.1],
                  x: [0, point.x, 0],
                  y: [0, point.y, 0],
                  scale: selected ? [0.9, 1.45, 0.9] : [0.75, 1.15, 0.75],
                }
              : { opacity: 0, x: 0, y: 0, scale: 0.7 }
          }
          transition={{
            duration: selected ? 1.1 : 1.8,
            repeat: energized ? Infinity : 0,
            ease: 'easeInOut',
            delay: index * 0.05,
          }}
        />
      ))}

      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 18%, transparent 82%, rgba(255,255,255,0.04) 100%)',
        }}
      />

      <div className="relative flex h-full min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-hud text-[0.64rem] uppercase tracking-[0.26em] text-[color:var(--faction-glow)]">
              {faction.name}
            </div>
            <div className="mt-2 font-hud text-[0.58rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.48)]">
              文明特征
            </div>
            <div className="mt-1 break-words text-[1.05rem] font-semibold leading-tight text-[color:var(--text-primary)]">
              {faction.civilization}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="border px-2 py-1 font-hud text-[0.6rem] uppercase tracking-[0.22em]"
              style={{
                borderColor: selected ? faction.glow : faction.primary,
                color: selected ? faction.glow : faction.primary,
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              {badgeLabel}
            </span>
            <Sigil faction={faction} energized={energized} />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="font-hud text-[0.68rem] uppercase tracking-[0.2em] text-[color:rgba(196,228,255,0.56)]">
            AI 性格原型 / {faction.archetype}
          </div>
          <div className="font-hud text-[0.58rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.48)]">
            核心优势
          </div>
          <p className="break-words text-[0.9rem] leading-6 text-[color:var(--text-muted)]">
            {faction.advantage}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          {faction.triggerWords.map((word) => (
            <span
              key={word}
              className="border px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.18em]"
              style={{
                borderColor: 'rgba(255,255,255,0.12)',
                color: 'var(--text-primary)',
                backgroundColor: energized
                  ? 'color-mix(in srgb, var(--faction-shadow) 24%, rgba(5,9,18,0.92))'
                  : 'rgba(255,255,255,0.02)',
              }}
            >
              {word}
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  )
})
