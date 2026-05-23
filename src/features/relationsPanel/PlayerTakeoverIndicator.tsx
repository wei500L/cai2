import { AnimatePresence, motion } from 'framer-motion'

type PlayerTakeoverIndicatorProps = {
  visible: boolean
}

export function PlayerTakeoverIndicator({ visible }: PlayerTakeoverIndicatorProps) {
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.span
          className="inline-flex flex-none items-center border border-[color:rgba(255,156,64,0.74)] bg-[color:rgba(255,137,42,0.1)] px-2 py-0.5 font-hud text-[0.5rem] tracking-[0.12em] text-[color:rgb(255,181,100)]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{
            opacity: 1,
            scale: 1,
            boxShadow: [
              '0 0 0 rgba(255,156,64,0)',
              '0 0 12px rgba(255,156,64,0.34)',
              '0 0 0 rgba(255,156,64,0)',
            ],
          }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{
            opacity: { duration: 0.18 },
            scale: { duration: 0.18 },
            boxShadow: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          AI 托管中
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}
