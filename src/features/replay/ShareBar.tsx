import { AnimatePresence, motion } from 'framer-motion'

type ShareBarProps = {
  toast: string | null
  onMockShare: (label: string) => void
}

const actions = ['导出史书', '分享名场面', '一键复制链接']

export function ShareBar({ toast, onMockShare }: ShareBarProps) {
  return (
    <div className="relative flex flex-wrap items-center justify-end gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onMockShare(action)}
          className="h-9 border border-[color:rgba(255,204,102,0.32)] bg-[color:rgba(255,204,102,0.08)] px-3 font-hud text-xs text-[color:rgba(255,245,220,0.82)] transition hover:bg-[color:rgba(255,204,102,0.16)]"
        >
          {action}
        </button>
      ))}
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-11 z-40 border border-[color:rgba(51,255,255,0.32)] bg-[color:rgba(4,18,22,0.94)] px-3 py-2 font-hud text-xs text-[color:rgba(196,255,255,0.9)] shadow-[0_0_20px_rgba(51,255,255,0.18)]"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
