import { GlowPanel } from '@/components/GlowPanel'
import { PixelButton } from '@/components/PixelButton'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { useGameStore } from '@/store/gameStore'
import type { FactionMeta } from '@/types/faction'

type ConfirmBarProps = {
  selectedFaction: FactionMeta | null
}

function navigateToGame() {
  window.history.pushState(null, '', '/game')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function ConfirmBar({ selectedFaction }: ConfirmBarProps) {
  const selectFaction = useGameStore((state) => state.selectFaction)
  const currentRoomId = useGameStore((state) => state.currentRoomId)

  const handleConfirm = () => {
    if (!selectedFaction) {
      return
    }

    selectFaction(selectedFaction.id)
    if (currentRoomId) {
      ActionDispatcher.selectFaction(selectedFaction.id)
      ActionDispatcher.setReady(true)
      ActionDispatcher.startRoom()
    }
    navigateToGame()
  }

  return (
    <GlowPanel
      tone={selectedFaction ? 'faction' : 'neutral'}
      factionId={selectedFaction?.id}
      className="border-[color:rgba(255,255,255,0.14)] bg-[color:rgba(5,9,18,0.94)] p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-hud text-[0.62rem] uppercase tracking-[0.26em] text-[color:rgba(196,228,255,0.52)]">
            当前选择
          </div>
          <div className="mt-2 text-[1rem] font-medium text-[color:var(--text-primary)]">
            {selectedFaction ? selectedFaction.name : '未锁定'}
          </div>
          {selectedFaction ? (
            <div className="mt-1 break-words text-[0.88rem] leading-6 text-[color:var(--text-muted)]">
              {selectedFaction.advantage}
            </div>
          ) : null}
        </div>

        <div className="relative shrink-0">
          {selectedFaction ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-3 opacity-70 blur-xl"
              style={{
                background: `radial-gradient(circle, ${selectedFaction.glow} 0%, ${selectedFaction.shadow} 42%, transparent 72%)`,
              }}
            />
          ) : null}
          <PixelButton
            tone={selectedFaction ? 'primary' : 'ghost'}
            disabled={!selectedFaction}
            onClick={handleConfirm}
            className="relative min-w-[11rem]"
          >
            确认出征
          </PixelButton>
        </div>
      </div>
    </GlowPanel>
  )
}
