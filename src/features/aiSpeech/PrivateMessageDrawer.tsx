import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { factionTokens } from '@/components/hudTheme'
import { factionMetaStore } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

function formatTime(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PrivateMessageDrawer() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const privateMessages = useGameStore((state) => state.privateMessages)
  const rightPanelOpen = useUIStore((state) => state.rightPanelOpen)
  const open = useUIStore((state) => state.privateDrawerOpen)
  const unreadCount = useUIStore((state) => state.unreadPrivateCount)
  const toggleDrawer = useUIStore((state) => state.togglePrivateDrawer)
  const incrementUnread = useUIStore((state) => state.incrementUnreadPrivateCount)
  const clearUnread = useUIStore((state) => state.clearUnreadPrivateCount)
  const factionMetaById = factionMetaStore((state) => state.byId)
  const seenIds = useRef<Set<string> | null>(null)
  const playerId = selectedFactionId ?? 'starlight'

  const visibleMessages = useMemo(
    () =>
      privateMessages
        .filter((message) => message.from === playerId || message.to === playerId)
        .slice(0, 32),
    [playerId, privateMessages],
  )

  useEffect(() => {
    if (!seenIds.current) {
      seenIds.current = new Set(privateMessages.map((message) => message.id))
      return
    }

    const seen = seenIds.current
    const incoming = privateMessages.filter(
      (message) => !seen.has(message.id) && message.to === playerId && message.from !== playerId,
    )

    if (incoming.length > 0 && !open) {
      for (const message of incoming) {
        incrementUnread()
        seen.add(message.id)
      }
    } else {
      for (const message of privateMessages) {
        seen.add(message.id)
      }
    }
  }, [incrementUnread, open, playerId, privateMessages])

  useEffect(() => {
    if (open) {
      clearUnread()
    }
  }, [clearUnread, open])

  return (
    <div
      className={clsx(
        'fixed bottom-[12.25rem] z-50 font-hud transition-all duration-300',
        rightPanelOpen
          ? 'right-[calc(min(86vw,320px)+1rem)] max-xl:right-4'
          : 'right-4',
      )}
    >
      <button
        type="button"
        onClick={toggleDrawer}
        className="relative border border-[color:rgba(198,137,255,0.58)] bg-[color:rgba(34,8,54,0.92)] px-3 py-2 text-[0.62rem] uppercase tracking-[0.22em] text-[#ead8ff] shadow-[0_0_24px_rgba(153,51,255,0.22)]"
        aria-label={open ? '关闭密谈抽屉' : '打开密谈抽屉'}
      >
        密谈
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center bg-[color:var(--text-hostile)] px-1 text-[0.56rem] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.aside
            initial={{ opacity: 0, x: 36, y: 16 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 36, y: 16 }}
            transition={{ duration: 0.22 }}
            className="absolute bottom-12 right-0 flex h-[min(28rem,calc(100vh-15rem))] w-[min(24rem,calc(100vw-2rem))] flex-col border border-[color:rgba(198,137,255,0.5)] bg-[color:rgba(16,4,28,0.96)] shadow-[0_0_34px_rgba(153,51,255,0.26)]"
          >
            <div className="flex items-center justify-between border-b border-[color:rgba(198,137,255,0.22)] px-4 py-3 text-[0.64rem] uppercase tracking-[0.22em] text-[#ead8ff]">
              <span>加密密谈</span>
              <span className="text-[color:rgba(234,216,255,0.52)]">{visibleMessages.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="grid gap-3">
                {visibleMessages.length === 0 ? (
                  <div className="border border-[color:rgba(198,137,255,0.18)] bg-[color:rgba(255,255,255,0.03)] px-3 py-4 text-center text-[0.66rem] tracking-[0.12em] text-[color:rgba(234,216,255,0.54)]">
                    暂无密谈记录
                  </div>
                ) : (
                  visibleMessages.map((message) => {
                    const own = message.from === playerId
                    const faction = factionMetaById[message.from]
                    const token = factionTokens[message.from]
                    const style = {
                      '--private-border': token.glow,
                    } as CSSProperties

                    return (
                      <motion.div
                        key={message.id}
                        layout
                        className={own ? 'ml-8' : 'mr-8'}
                        style={style}
                      >
                        <div
                          className="border bg-[color:rgba(47,12,74,0.72)] px-3 py-2 text-[color:var(--text-primary)]"
                          style={{
                            borderColor: own ? 'rgba(198,137,255,0.32)' : 'var(--private-border)',
                          }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[0.52rem] uppercase tracking-[0.16em] text-[color:rgba(234,216,255,0.55)]">
                            <span>{own ? '我方' : faction?.name ?? message.from}</span>
                            <span>{formatTime(message.createdAt)}</span>
                          </div>
                          <p className="break-words text-[0.72rem] leading-5">{message.body}</p>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
