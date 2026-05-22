import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { InfluenceBar } from './InfluenceBar'
import { ToneMeter } from './ToneMeter'
import type { CommandMode, ToneAnalysis } from './types'

type MessageInputProps = {
  content: string
  mode: CommandMode
  tone: ToneAnalysis
  disabled: boolean
  reboundKey: number
  placeholder: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function MessageInput({
  content,
  mode,
  tone,
  disabled,
  reboundKey,
  placeholder,
  onChange,
  onSubmit,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(72, textarea.scrollHeight)}px`
  }, [content])

  return (
    <motion.div
      className="grid min-h-0 grid-cols-[minmax(0,1fr)_12rem] gap-3 max-sm:grid-cols-1"
      animate={reboundKey ? { scale: [1, 0.985, 1.01, 1] } : { scale: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="grid min-h-0 gap-2">
        <ToneMeter tone={tone} mode={mode} />
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            maxLength={400}
            disabled={disabled}
            placeholder={disabled ? '等待行动期开始' : placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
            className="h-[4.4rem] max-h-[4.5rem] min-h-[4.4rem] w-full resize-none border border-[color:rgba(255,255,255,0.14)] bg-[color:rgba(0,0,0,0.42)] px-3 py-2 pr-16 font-hud text-[0.72rem] leading-5 text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[color:rgba(196,228,255,0.32)] focus:border-[color:var(--border-glow)] focus:shadow-[0_0_14px_rgba(51,170,255,0.18)] disabled:cursor-not-allowed disabled:opacity-55"
          />
          <div className="pointer-events-none absolute bottom-2 right-3 font-hud text-[0.52rem] uppercase tracking-[0.14em] text-[color:rgba(196,228,255,0.42)]">
            {content.length}/400
          </div>
        </div>
      </div>
      <InfluenceBar content={content} mode={mode} tone={tone} />
    </motion.div>
  )
}
