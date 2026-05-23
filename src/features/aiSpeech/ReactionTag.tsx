import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { factionTokens } from '@/components/hudTheme'
import { useFactionMeta } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'

type ReactionTagProps = {
  eventId: string
}

export function ReactionTag({ eventId }: ReactionTagProps) {
  const [visible, setVisible] = useState(true)
  const reactions = useGameStore((state) => state.aiReactionByEvent.get(eventId) ?? [])
  const factionId = reactions[0]?.factionId ?? null
  const faction = useFactionMeta(factionId ?? 'starlight')
  const token = factionTokens[factionId ?? 'starlight']
  const reactionLabel = useMemo(() => reactions[0]?.reaction ?? '', [reactions])
  const style = {
    '--reaction-border': token.glow,
    '--reaction-fill': token.shadow,
  } as CSSProperties

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1_500)

    return () => window.clearTimeout(timer)
  }, [eventId, reactionLabel])

  if (reactions.length === 0) {
    return null
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.92 }}
          animate={{ opacity: 1, y: -8, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.92 }}
          transition={{ duration: 0.22 }}
          className="pointer-events-none border bg-[color:rgba(0,0,0,0.78)] px-3 py-1.5 font-hud text-[0.62rem] uppercase tracking-[0.2em] text-[color:var(--text-primary)]"
          style={{
            ...style,
            borderColor: 'var(--reaction-border)',
            boxShadow: '0 0 18px color-mix(in srgb, var(--reaction-border) 36%, transparent)',
          }}
        >
          {faction?.name ?? factionId ?? '未知'} · {reactionLabel}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
