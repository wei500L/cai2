import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'

type ScrollNumberProps = {
  value: number | string
  className?: string
  prefix?: string
  suffix?: string
  format?: (value: number) => string
}

export function ScrollNumber({
  value,
  className,
  prefix,
  suffix,
  format,
}: ScrollNumberProps) {
  const previous = useRef<string | null>(null)
  const current = useMemo(() => {
    if (typeof value === 'number') {
      return format ? format(value) : new Intl.NumberFormat('en-US').format(value)
    }

    return value
  }, [format, value])
  const [direction, setDirection] = useState<1 | -1>(1)

  useEffect(() => {
    if (previous.current === null) {
      previous.current = current
      return
    }

    const nextNumber = Number(current.replace(/,/g, ''))
    const prevNumber = Number(previous.current.replace(/,/g, ''))

    if (!Number.isNaN(nextNumber) && !Number.isNaN(prevNumber)) {
      setDirection(nextNumber >= prevNumber ? 1 : -1)
    }

    previous.current = current
  }, [current])

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-mono text-[color:var(--text-primary)] tabular-nums',
        className,
      )}
    >
      {prefix ? <span>{prefix}</span> : null}
      <span className="relative inline-flex min-w-[2ch] overflow-hidden leading-none">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={current}
            className="inline-block"
            initial={{ y: direction > 0 ? 14 : -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: direction > 0 ? -14 : 14, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {current}
          </motion.span>
        </AnimatePresence>
      </span>
      {suffix ? <span>{suffix}</span> : null}
    </span>
  )
}

