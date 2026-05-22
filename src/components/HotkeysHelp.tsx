import { AnimatePresence, motion } from 'framer-motion'
import { GlowPanel } from './GlowPanel'
import { PixelButton } from './PixelButton'
import { useUIStore } from '@/store/uiStore'

const hotkeys = [
  ['1-5', '切换 CommandTerminal 模式'],
  ['Enter', '发送当前指令'],
  ['Shift+Enter', '输入换行'],
  ['Tab', '切换 HUD 面板焦点'],
  ['E', '折叠 / 展开 EventStream'],
  ['R', '折叠 / 展开 RelationsPanel'],
  ['F', 'EventStream 全屏 / 还原'],
  ['M', '重置地图视角'],
  ['鼠标滚轮', '缩放地图'],
  ['右键拖拽', '平移地图'],
  ['Esc', '关闭 modal / 抽屉 / 取消聚焦'],
  ['Space', '暂停 / 继续'],
  ['H', '显示 / 隐藏快捷键帮助'],
  [',', '打开 / 关闭设置面板'],
  ['D', '显示 / 隐藏调试条'],
]

export function HotkeysHelp() {
  const open = useUIStore((state) => state.hotkeysHelpOpen)
  const setOpen = useUIStore((state) => state.setHotkeysHelpOpen)

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 max-sm:p-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="w-[min(92vw,42rem)] max-sm:h-screen max-sm:w-screen"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <GlowPanel className="rounded-none max-sm:h-full">
              <div className="flex h-full flex-col p-5 font-hud">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[0.58rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                      HOTKEYS
                    </div>
                    <div className="mt-1 text-lg uppercase tracking-[0.2em]">战术快捷键</div>
                  </div>
                  <PixelButton tone="ghost" className="px-3 py-1 text-[0.54rem]" onClick={() => setOpen(false)}>
                    关闭
                  </PixelButton>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {hotkeys.map(([key, label]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[7rem_minmax(0,1fr)] items-center border border-[color:rgba(196,228,255,0.12)] bg-[color:rgba(255,255,255,0.025)] px-3 py-2"
                    >
                      <kbd className="text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--border-glow)]">
                        {key}
                      </kbd>
                      <span className="text-[0.62rem] tracking-[0.12em] text-[color:var(--text-muted)]">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlowPanel>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
