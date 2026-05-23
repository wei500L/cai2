import { Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useEpochNarration } from '@/store/epochSummaryStore'

const CHAR_INTERVAL_MS = Math.round(1000 / 30)

type InlineFrameKind = 'root' | 'strong' | 'em'

type InlineFrame = {
  kind: InlineFrameKind
  children: ReactNode[]
  buffer: string
}

function createFrame(kind: InlineFrameKind): InlineFrame {
  return { kind, children: [], buffer: '' }
}

function flushFrame(frame: InlineFrame) {
  if (frame.buffer) {
    frame.children.push(frame.buffer)
    frame.buffer = ''
  }
}

function wrapFrame(frame: InlineFrame, key?: string) {
  if (frame.kind === 'strong') {
    return (
      <strong key={key} className="font-semibold text-[color:rgba(255,242,218,0.98)]">
        {frame.children}
      </strong>
    )
  }

  if (frame.kind === 'em') {
    return (
      <em key={key} className="italic text-[color:rgba(255,231,184,0.92)]">
        {frame.children}
      </em>
    )
  }

  return <Fragment key={key}>{frame.children}</Fragment>
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const stack: InlineFrame[] = [createFrame('root')]
  let index = 0

  while (index < text.length) {
    const current = stack[stack.length - 1]

    if (text.startsWith('**', index)) {
      flushFrame(current)

      if (current.kind === 'strong') {
        const frame = stack.pop()
        if (frame) {
          stack[stack.length - 1].children.push(wrapFrame(frame, `${index}-bold`))
        }
      } else {
        stack.push(createFrame('strong'))
      }

      index += 2
      continue
    }

    if (text[index] === '*') {
      flushFrame(current)

      if (current.kind === 'em') {
        const frame = stack.pop()
        if (frame) {
          stack[stack.length - 1].children.push(wrapFrame(frame, `${index}-italic`))
        }
      } else {
        stack.push(createFrame('em'))
      }

      index += 1
      continue
    }

    current.buffer += text[index]
    index += 1
  }

  while (stack.length > 1) {
    const frame = stack.pop()
    if (!frame) {
      continue
    }

    flushFrame(frame)
    stack[stack.length - 1].children.push(wrapFrame(frame))
  }

  flushFrame(stack[0])
  return stack[0].children
}

function renderMarkdownBlocks(text: string) {
  return text.split('\n').map((line, index) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)

    if (heading) {
      const level = heading[1].length
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      return (
        <Tag
          key={`${index}-${line}`}
          className="font-hud text-[0.8rem] uppercase tracking-[0.16em] text-[color:rgba(255,231,184,0.96)]"
        >
          {renderInlineMarkdown(heading[2])}
        </Tag>
      )
    }

    if (line.trim().length === 0) {
      return <span key={`${index}-${line}`} className="block h-2" />
    }

    return (
      <p key={`${index}-${line}`} className="leading-6 text-[color:rgba(255,242,218,0.92)] sm:leading-7">
        {renderInlineMarkdown(line)}
      </p>
    )
  })
}

function ThinkingSkeleton() {
  const aiThinkingState = useGameStore((state) => state.aiThinkingState)
  const progress = aiThinkingState?.progress ?? 0
  const isKnownProgress = aiThinkingState !== null

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 1.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none mx-auto w-[min(50rem,calc(100vw-2rem))] border border-[color:rgba(255,204,102,0.34)] bg-[color:rgba(8,5,2,0.74)] px-4 py-3 text-center shadow-[0_0_36px_rgba(255,204,102,0.14)] backdrop-blur-md"
    >
      <div className="mb-2 font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(255,204,102,0.82)]">
        史官 AI
      </div>
      <div className="grid min-h-[3rem] gap-3">
        <div className="mx-auto h-2 w-[min(22rem,70%)] overflow-hidden border border-[color:rgba(255,231,184,0.12)] bg-[color:rgba(0,0,0,0.22)]">
          <motion.div
            className="h-full bg-[linear-gradient(90deg,rgba(139,83,35,0.72),rgba(255,204,102,0.92))] shadow-[0_0_14px_rgba(255,204,102,0.36)]"
            animate={{ width: isKnownProgress ? `${Math.max(10, Math.round(progress * 100))}%` : '42%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
        <div className="font-sans text-[0.9rem] leading-6 text-[color:rgba(255,242,218,0.92)] sm:text-[1rem] sm:leading-7">
          正在生成纪元旁白...
        </div>
      </div>
    </motion.div>
  )
}

function TypewriterNarration({
  narrative,
  source,
}: {
  narrative: string
  source: 'llm' | 'template_fallback'
}) {
  const [visibleLength, setVisibleLength] = useState(0)

  useEffect(() => {
    if (!narrative) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= narrative.length) {
          window.clearInterval(timer)
          return current
        }

        return current + 1
      })
    }, CHAR_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [narrative])

  const visibleText = narrative.slice(0, visibleLength)

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 1.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none relative mx-auto w-[min(50rem,calc(100vw-2rem))] border border-[color:rgba(255,204,102,0.34)] bg-[color:rgba(8,5,2,0.74)] px-4 py-3 text-center shadow-[0_0_36px_rgba(255,204,102,0.14)] backdrop-blur-md"
    >
      <div className="mb-2 font-hud text-[0.58rem] uppercase tracking-[0.28em] text-[color:rgba(255,204,102,0.82)]">
        史官 AI
      </div>
      <div className="min-h-[3rem] font-sans text-[0.9rem] leading-6 text-[color:rgba(255,242,218,0.92)] sm:text-[1rem] sm:leading-7">
        {renderMarkdownBlocks(visibleText)}
        <motion.span
          aria-hidden
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="ml-1 inline-block h-4 w-1 bg-[color:rgba(255,204,102,0.86)] align-[-0.15em]"
        />
      </div>
      {source === 'template_fallback' ? (
        <div className="pointer-events-none absolute bottom-2 right-3 font-hud text-[0.5rem] tracking-[0.22em] text-[color:rgba(255,231,184,0.4)]">
          FALLBACK
        </div>
      ) : null}
    </motion.div>
  )
}

export function AINarration() {
  const currentEpoch = useGameStore((state) => state.epoch.id)
  const epic = useEpochNarration(currentEpoch).epic
  const narrative = epic?.narrative?.trim() ?? ''

  if (!narrative) {
    return <ThinkingSkeleton />
  }

  return <TypewriterNarration key={`${epic?.source ?? 'unknown'}:${narrative}`} narrative={narrative} source={epic?.source ?? 'llm'} />
}
