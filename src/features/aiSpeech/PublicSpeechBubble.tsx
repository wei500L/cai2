import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { factionTokens } from '@/components/hudTheme'
import { factionById, type FactionId } from '@/mock/factions'
import { splitByKeywords, type KeywordTone } from '@/utils/keywords'

type PublicSpeechBubbleProps = {
  actor: FactionId
  text: string
  compact?: boolean
  showTail?: boolean
}

const keywordClass: Record<KeywordTone, string> = {
  hostile: 'text-[color:var(--text-hostile)]',
  cooperative: 'text-[#49f28a]',
  deceptive: 'text-[#d7a7ff]',
  neutral: '',
}

export function PublicSpeechBubble({
  actor,
  text,
  compact = false,
  showTail = true,
}: PublicSpeechBubbleProps) {
  const faction = factionById[actor]
  const token = factionTokens[actor]
  const [visibleLength, setVisibleLength] = useState(compact ? text.length : 0)

  useEffect(() => {
    if (compact) {
      setVisibleLength(text.length)
      return undefined
    }

    setVisibleLength(0)
    const interval = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= text.length) {
          window.clearInterval(interval)
          return current
        }

        return current + 1
      })
    }, 22)

    return () => window.clearInterval(interval)
  }, [compact, text])

  const visibleText = text.slice(0, visibleLength)
  const segments = useMemo(() => splitByKeywords(visibleText), [visibleText])
  const style = {
    '--speech-border': token.glow,
    '--speech-fill': token.shadow,
    '--speech-primary': token.primary,
  } as CSSProperties

  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.24 }}
      className={clsx(
        'relative border bg-[color:rgba(0,0,0,0.72)] text-[color:var(--text-primary)]',
        compact ? 'px-3 py-2' : 'max-w-[min(28rem,84vw)] px-4 py-3',
      )}
      style={{
        ...style,
        borderColor: 'var(--speech-border)',
        boxShadow: '0 0 22px color-mix(in srgb, var(--speech-border) 34%, transparent)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'grid flex-none place-items-center border font-hud font-bold text-[color:var(--text-primary)]',
            compact ? 'h-7 w-7 text-[0.56rem]' : 'h-9 w-9 text-[0.68rem]',
          )}
          style={{
            borderColor: 'var(--speech-border)',
            background: 'linear-gradient(135deg, var(--speech-primary), var(--speech-fill))',
          }}
        >
          {faction.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 font-hud uppercase tracking-[0.18em]">
            <span className={compact ? 'text-[0.54rem]' : 'text-[0.6rem]'}>
              {faction.name}
            </span>
            <span className="h-px flex-1 bg-[color:rgba(255,255,255,0.12)]" />
          </div>
          <p className={clsx('break-words leading-5', compact ? 'text-[0.7rem]' : 'text-[0.78rem]')}>
            {segments.map((segment, index) => (
              <span key={`${segment.text}-${index}`} className={keywordClass[segment.tone]}>
                {segment.text}
              </span>
            ))}
            {!compact && visibleLength < text.length ? (
              <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-[color:var(--speech-border)] align-[-0.15em]" />
            ) : null}
          </p>
        </div>
      </div>
      {showTail && !compact ? (
        <span
          aria-hidden
          className="absolute left-8 top-full h-3 w-3 rotate-45 border-b border-r bg-[color:rgba(0,0,0,0.72)]"
          style={{ borderColor: 'var(--speech-border)' }}
        />
      ) : null}
    </motion.article>
  )
}
