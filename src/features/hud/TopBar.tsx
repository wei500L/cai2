import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { ConnectionBadge } from '@/components/ConnectionBadge'
import { PixelButton } from '@/components/PixelButton'
import { Countdown } from '@/features/phaseSystem/Countdown'
import {
  getPhaseLabel,
  getPhaseProgress,
  getPhaseSubtitle,
  getPhaseUIConfig,
} from '@/features/phaseSystem/PhaseStateMachine'
import { GlowPanel } from '@/components/GlowPanel'
import { factionTokens, resolveFactionId } from '@/components/hudTheme'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import type { RoomPlayerSnapshot } from '@/protocol/types'

function playerInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

function playerTooltip(player: RoomPlayerSnapshot) {
  const readyLabel = player.ready ? 'READY' : 'WAIT'
  const statusLabel = player.ai_takeover ? 'AI 托管中' : player.connected ? '在线' : '离线'
  return `${player.display_name}\n${readyLabel}\n${statusLabel}`
}

function PlayerAvatarGroup({
  currentPlayerId,
  players,
}: {
  currentPlayerId: string | null
  players: RoomPlayerSnapshot[]
}) {
  if (players.length === 0) {
    return null
  }

  const visiblePlayers = [...players]
    .sort((a, b) => {
      if (a.player_id === currentPlayerId) {
        return -1
      }
      if (b.player_id === currentPlayerId) {
        return 1
      }
      return 0
    })
    .slice(0, 4)

  return (
    <div className="flex max-w-[8.75rem] flex-none items-center justify-end -space-x-2 overflow-hidden pl-1">
      {visiblePlayers.map((player) => {
        const token = player.faction_id ? factionTokens[player.faction_id] : null
        const dotColor = player.ai_takeover
          ? 'rgb(255,181,100)'
          : player.connected
            ? 'rgb(112,255,166)'
            : 'rgba(196,228,255,0.42)'

        return (
          <div
            key={player.player_id}
            className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden border bg-[color:rgba(5,9,18,0.96)] text-[0.56rem] text-[color:var(--text-primary)]"
            style={
              {
                borderColor: token?.glow ?? 'rgba(196,228,255,0.2)',
                boxShadow: token ? `0 0 12px ${token.shadow}` : 'none',
              } as CSSProperties
            }
            title={playerTooltip(player)}
            aria-label={playerTooltip(player)}
          >
            <span className="font-hud">{playerInitial(player.display_name)}</span>
            <span
              aria-hidden
              className="absolute bottom-[2px] right-[2px] h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dotColor, boxShadow: `0 0 7px ${dotColor}` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export function TopBar() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const roomPlayers = useGameStore((state) => state.roomPlayers)
  const currentPlayerId = useGameStore((state) => state.currentPlayerId)
  const epoch = useGameStore((state) => state.epoch)
  const isPaused = useGameStore((state) => state.isPaused)
  const togglePause = useGameStore((state) => state.togglePause)
  const hudMode = useUIStore((state) => state.hudMode)
  const toggleSettings = useUIStore((state) => state.toggleSettings)
  const factionId = resolveFactionId(selectedFactionId) ?? 'starlight'
  const faction = factionTokens[factionId]
  const label = getPhaseLabel(hudMode)
  const subtitle = getPhaseSubtitle(hudMode)
  const config = getPhaseUIConfig(hudMode)
  const progress = getPhaseProgress(epoch, hudMode)

  return (
    <GlowPanel
      tone="faction"
      factionId={factionId}
      className="h-14 border-x-0 border-t-0 rounded-none"
    >
      <div
        className="grid h-14 grid-cols-[minmax(8rem,0.78fr)_minmax(10rem,1.35fr)_auto] items-center gap-3 px-3 font-hud text-[0.72rem] uppercase tracking-[0.16em] sm:px-4"
        style={{ '--hud-faction-glow': faction.glow } as CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[color:rgba(196,228,255,0.58)]">纪元</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.id}</span>
          <span className="text-[color:rgba(196,228,255,0.58)]">· 回合</span>
          <span className="font-mono text-[color:var(--hud-faction-glow)]">{epoch.turn}</span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-center gap-3">
            <motion.span
              key={hudMode}
              className="truncate text-center text-[0.86rem] text-[color:var(--text-primary)]"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {label}
            </motion.span>
            <span className="hidden border border-[color:rgba(196,228,255,0.16)] px-2 py-1 text-[0.5rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.54)] lg:inline">
              HUD {config.hudOcclusion}%
            </span>
          </div>
          <div className="mx-auto mt-1 h-[3px] w-full max-w-[22rem] bg-[color:rgba(255,255,255,0.08)]">
            <motion.div
              className="h-full bg-[color:var(--hud-faction-glow)]"
              style={{ transformOrigin: 'left' }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.18, ease: 'linear' }}
            />
          </div>
          <div className="mt-1 hidden truncate text-center text-[0.5rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.42)] sm:block">
            {subtitle}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <Countdown remainingMs={epoch.phaseDurationMs} />
          <PixelButton
            tone="ghost"
            className="px-3 py-1 text-[0.58rem] tracking-[0.22em]"
            onClick={togglePause}
          >
            {isPaused ? '继续' : '暂停'}
          </PixelButton>
          <PlayerAvatarGroup currentPlayerId={currentPlayerId} players={roomPlayers} />
          <ConnectionBadge />
          <PixelButton
            tone="ghost"
            className="px-2 py-1 text-[0.72rem] tracking-0"
            onClick={toggleSettings}
            aria-label="打开设置"
          >
            ⚙
          </PixelButton>
        </div>
      </div>
    </GlowPanel>
  )
}
