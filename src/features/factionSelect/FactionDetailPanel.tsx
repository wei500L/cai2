import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { GlowPanel } from '@/components/GlowPanel'
import type { FactionMeta } from '@/mock/factions'
import { speechStyleDescriptions } from '@/mock/factions'

type FactionDetailPanelProps = {
  faction: FactionMeta | null
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function scatter(hash: number, span: number) {
  const x = ((hash % 9) - 4) * span
  const y = (((hash >> 3) % 9) - 4) * (span * 0.85)
  return { x, y }
}

function ShardedText({
  text,
  className,
  as = 'p',
}: {
  text: string
  className?: string
  as?: 'p' | 'div' | 'span' | 'h2'
}) {
  const Tag = as

  return (
    <Tag className={clsx('flex flex-wrap gap-0 whitespace-pre-wrap', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {Array.from(text).map((character, index) => {
          const hash = hashString(`${text}:${index}`)
          const offset = scatter(hash, 4.5)
          return (
            <motion.span
              key={`${text}-${index}`}
              className="inline-block"
              initial={{
                opacity: 0,
                x: offset.x,
                y: offset.y,
                scale: 0.7,
                filter: 'blur(7px)',
              }}
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
              }}
              exit={{
                opacity: 0,
                x: -offset.x * 1.35,
                y: -offset.y * 1.35,
                scale: 0.55,
                filter: 'blur(10px)',
              }}
              transition={{
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1],
                delay: (index % 12) * 0.008,
              }}
            >
              {character === ' ' ? '\u00A0' : character}
            </motion.span>
          )
        })}
      </AnimatePresence>
    </Tag>
  )
}

export function FactionDetailPanel({ faction }: FactionDetailPanelProps) {
  return (
    <GlowPanel
      tone={faction ? 'faction' : 'neutral'}
      factionId={faction?.id}
      className="min-h-[28rem] border-[color:rgba(255,255,255,0.16)] bg-[color:rgba(5,9,18,0.94)] p-0"
      style={
        {
          '--faction-glow': faction?.glow ?? 'var(--border-glow)',
          '--faction-primary': faction?.primary ?? 'var(--border-glow)',
          '--faction-shadow': faction?.shadow ?? 'rgba(51, 170, 255, 0.14)',
        } as CSSProperties
      }
    >
      <div className="relative flex min-h-[28rem] flex-col gap-4 p-4">
        <AnimatePresence mode="wait" initial={false}>
          {faction ? (
            <motion.div
              key={faction.id}
              className="flex h-full flex-1 flex-col gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <div className="grid gap-3">
                <div className="font-hud text-[0.66rem] uppercase tracking-[0.28em] text-[color:var(--faction-glow)]">
                  {faction.name}
                </div>
                <ShardedText
                  as="h2"
                  text={faction.slogan}
                  className="max-w-[22ch] text-[1.7rem] font-semibold leading-[1.16] text-[color:var(--text-primary)]"
                />
              </div>

              <div className="grid gap-3 border-y border-[color:rgba(255,255,255,0.08)] py-3">
                <div className="grid gap-1">
                  <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                    AI 发言风格
                  </div>
                  <ShardedText
                    text={speechStyleDescriptions[faction.speechStyle]}
                    className="text-[0.9rem] leading-7 text-[color:var(--text-muted)]"
                  />
                  <div className="font-hud text-[0.58rem] uppercase tracking-[0.18em] text-[color:var(--faction-glow)]">
                    {faction.speechStyle}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                    文明特征
                  </div>
                  <div className="text-[1rem] font-medium text-[color:var(--text-primary)]">
                    {faction.civilization}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                    核心优势
                  </div>
                  <ShardedText
                    text={faction.advantage}
                    className="text-[0.92rem] leading-7 text-[color:var(--text-muted)]"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                  关键词
                </div>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {faction.triggerWords.map((word, index) => (
                      <motion.span
                        key={`${faction.id}-${word}`}
                        className="border px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.18em] text-[color:var(--text-primary)]"
                        style={{
                          borderColor: 'rgba(255,255,255,0.14)',
                          backgroundColor: 'rgba(255,255,255,0.03)',
                        }}
                        initial={{ opacity: 0, y: 10, scale: 0.7 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.7 }}
                        transition={{
                          duration: 0.24,
                          ease: 'easeOut',
                          delay: index * 0.03,
                        }}
                      >
                        {word}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-auto grid gap-2 border-t border-[color:rgba(255,255,255,0.08)] pt-3">
                <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                  角色原型
                </div>
                <div className="text-[0.92rem] leading-7 text-[color:var(--text-muted)]">
                  {faction.archetype}
                </div>
                <div className="mt-2 font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.54)]">
                  性格弱点
                </div>
                <ShardedText
                  text="此势力的性格弱点将在战局中显现"
                  className="text-[0.92rem] leading-7 text-[color:var(--text-muted)]"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="flex h-full flex-1 items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid justify-items-center gap-4">
                <div
                  className="grid aspect-square h-28 place-items-center border border-[color:rgba(255,255,255,0.12)]"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 40%, rgba(51,170,255,0.28), transparent 60%)',
                    boxShadow: '0 0 0 1px rgba(51,170,255,0.2), 0 0 20px rgba(51,170,255,0.14)',
                  }}
                >
                  <div
                    className="h-12 w-12 border border-[color:rgba(255,255,255,0.18)]"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(51,170,255,0.12), rgba(255,255,255,0.02))',
                    }}
                  />
                </div>
                <div className="font-hud text-[0.62rem] uppercase tracking-[0.28em] text-[color:rgba(196,228,255,0.52)]">
                  待命
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlowPanel>
  )
}
