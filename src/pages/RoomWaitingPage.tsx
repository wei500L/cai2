import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GlowPanel } from '@/components/GlowPanel'
import { PixelButton } from '@/components/PixelButton'
import { Scanlines } from '@/components/Scanlines'
import { StatusBadge } from '@/components/StatusBadge'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import type { RoomMode } from '@/protocol/types'

function CreateIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
      <path d="M4 12h12" />
      <path d="m12 6 6 6-6 6" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
      <path d="M9 9h10v10H9z" />
      <path d="M5 15V5h10" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
      <path d="M4 12h13" />
      <path d="m12 6 6 6-6 6" />
    </svg>
  )
}

function formatRoomMode(mode: RoomMode | null) {
  if (mode === 'multi_4v4') {
    return 'MULTI 4V4'
  }

  if (mode === 'solo_1v7') {
    return 'SOLO 1V7'
  }

  return '未定义'
}

function roomStatusLabel(status: string | null) {
  if (status === 'lobby') {
    return 'WAITING'
  }

  if (status === 'running') {
    return 'RUNNING'
  }

  if (status === 'starting') {
    return 'STARTING'
  }

  return status ? status.toUpperCase() : 'IDLE'
}

function goToFactionSelect() {
  window.history.pushState(null, '', '/faction-select')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function goHome() {
  try {
    window.localStorage.removeItem('diplomacy_current_room_id')
    window.localStorage.removeItem('diplomacy_current_player_id')
  } catch {
    // ignore
  }
  window.history.pushState(null, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function RoomWaitingPage() {
  const connectionStatus = useUIStore((state) => state.connectionStatus)
  const connectionFailureReason = useUIStore((state) => state.connectionFailureReason)
  const currentRoomId = useGameStore((state) => state.currentRoomId)
  const currentPlayerId = useGameStore((state) => state.currentPlayerId)
  const roomMode = useGameStore((state) => state.roomMode)
  const roomStatus = useGameStore((state) => state.roomStatus)
  const roomPlayers = useGameStore((state) => state.roomPlayers)
  const [displayName, setDisplayName] = useState('Player')
  const [roomCode, setRoomCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('diplomacy_lobby_display_name')
    if (saved) {
      setDisplayName(saved)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('diplomacy_lobby_display_name', displayName)
  }, [displayName])

  useEffect(() => {
    if (!message) {
      return undefined
    }

    const timer = window.setTimeout(() => setMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [message])

  const hostPlayerId = roomPlayers[0]?.player_id ?? null
  const canContinue = Boolean(currentRoomId) && currentPlayerId === hostPlayerId
  const playerCount = roomPlayers.length
  const otherPlayers = useMemo(
    () => roomPlayers.filter((player) => player.player_id !== currentPlayerId),
    [currentPlayerId, roomPlayers],
  )

  const handleCreateRoom = () => {
    const trimmedName = displayName.trim()
    if (!trimmedName) {
      setMessage('请输入指挥官名称')
      return
    }

    setBusy('create')
    const result = ActionDispatcher.createRoom('solo_1v7', trimmedName)
    if (!result.ok) {
      setBusy(null)
      setMessage(result.error ?? '创建房间失败')
      return
    }

    setMessage('房间创建请求已发送')
    setBusy(null)
  }

  const handleJoinRoom = () => {
    const trimmedName = displayName.trim()
    const trimmedRoomCode = roomCode.trim()

    if (!trimmedName) {
      setMessage('请输入指挥官名称')
      return
    }

    if (!trimmedRoomCode) {
      setMessage('请输入房间码')
      return
    }

    setBusy('join')
    const result = ActionDispatcher.joinRoom(trimmedRoomCode, trimmedName)
    if (!result.ok) {
      setBusy(null)
      setMessage(result.error ?? '加入房间失败')
      return
    }

    setMessage('加入请求已发送')
    setBusy(null)
  }

  const handleCopyRoomCode = async () => {
    if (!currentRoomId) {
      return
    }

    try {
      await navigator.clipboard.writeText(currentRoomId)
      setMessage('房间码已复制')
    } catch {
      setMessage('复制失败')
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--bg-space)] text-[color:var(--text-primary)]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(8,14,24,0.96) 0%, rgba(5,9,18,0.98) 50%, rgba(8,12,20,0.96) 100%), repeating-linear-gradient(90deg, rgba(51,170,255,0.06) 0, rgba(51,170,255,0.06) 1px, transparent 1px, transparent 88px), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 88px)',
        }}
      />
      <Scanlines className="z-[5] opacity-40" />

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:rgba(255,255,255,0.08)] pb-3 font-hud">
          <div className="grid gap-2">
            <div className="text-[0.66rem] uppercase tracking-[0.32em] text-[color:rgba(196,228,255,0.54)]">
              Multiplayer Lobby
            </div>
            <h1 className="text-[1.25rem] font-semibold leading-none tracking-[0.08em] text-[color:var(--text-primary)]">
              联机等待区
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.58rem] uppercase tracking-[0.2em]">
            <StatusBadge state={connectionStatus === 'open' ? 'friendly' : 'neutral'}>
              {connectionStatus}
            </StatusBadge>
            <StatusBadge state={roomStatus === 'lobby' ? 'neutral' : 'friendly'}>
              {roomStatusLabel(roomStatus)}
            </StatusBadge>
          </div>
        </header>

        <div className="grid flex-1 gap-4 py-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
          <GlowPanel
            tone="neutral"
            className="min-h-[24rem] border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(5,9,18,0.92)] p-4"
          >
            <div className="grid h-full gap-4">
              <div className="flex items-center justify-between gap-3 font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.58)]">
                <span>ROOM CONTROL</span>
                <span>{formatRoomMode(roomMode)}</span>
              </div>

              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="font-hud text-[0.6rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.52)]">
                    指挥官名称
                  </span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="border border-[color:rgba(255,255,255,0.14)] bg-[color:rgba(6,10,20,0.9)] px-3 py-3 text-[0.9rem] text-[color:var(--text-primary)] outline-none placeholder:text-[color:rgba(196,228,255,0.32)] focus:border-[color:var(--border-glow)]"
                    placeholder="输入昵称"
                    maxLength={24}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="font-hud text-[0.6rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.52)]">
                    房间码
                  </span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    className="border border-[color:rgba(255,255,255,0.14)] bg-[color:rgba(6,10,20,0.9)] px-3 py-3 text-[0.9rem] uppercase tracking-[0.16em] text-[color:var(--text-primary)] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[color:rgba(196,228,255,0.32)] focus:border-[color:var(--border-glow)]"
                    placeholder="输入已有房间码"
                    maxLength={24}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PixelButton
                  icon={<CreateIcon />}
                  className="min-h-12 w-full"
                  onClick={handleCreateRoom}
                  disabled={busy !== null || displayName.trim().length === 0}
                >
                  创建房间
                </PixelButton>
                <PixelButton
                  tone="ghost"
                  icon={<JoinIcon />}
                  className="min-h-12 w-full"
                  onClick={handleJoinRoom}
                  disabled={busy !== null || displayName.trim().length === 0 || roomCode.trim().length === 0}
                >
                  加入房间
                </PixelButton>
              </div>

              <div className="grid gap-2 border-t border-[color:rgba(255,255,255,0.08)] pt-3 text-[0.72rem] text-[color:var(--text-muted)]">
                <div>模式固定为 MULTI 4V4。</div>
                <div>创建后可直接进入势力选择，加入后等待房主推进流程。</div>
              </div>

              {message ? (
                <div className="border border-[color:rgba(255,255,255,0.1)] bg-white/[0.03] px-3 py-2 font-hud text-[0.6rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.62)]">
                  {message}
                </div>
              ) : null}

              {connectionFailureReason ? (
                <div className="border border-[color:rgba(255,102,102,0.42)] bg-[color:rgba(34,10,10,0.62)] px-3 py-2 text-[0.78rem] text-[color:rgba(255,205,210,0.88)]">
                  {connectionFailureReason}
                </div>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2">
                <PixelButton
                  tone="ghost"
                  icon={<ArrowIcon />}
                  className="px-4 py-2 text-[0.62rem]"
                  onClick={goHome}
                >
                  返回首页
                </PixelButton>
                <PixelButton
                  icon={<ArrowIcon />}
                  className="px-4 py-2 text-[0.62rem]"
                  onClick={goToFactionSelect}
                  disabled={!canContinue}
                >
                  进入势力选择
                </PixelButton>
              </div>
            </div>
          </GlowPanel>

          <div className="grid gap-4">
            <GlowPanel
              tone="neutral"
              className="border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(5,9,18,0.92)] p-4"
            >
              <div className="flex items-center justify-between gap-3 font-hud">
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.58)]">
                  ROOM STATUS
                </div>
                <button
                  type="button"
                  onClick={handleCopyRoomCode}
                  disabled={!currentRoomId}
                  className="inline-flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.62)] disabled:opacity-40"
                >
                  <CopyIcon />
                  复制房间码
                </button>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-3 text-[0.72rem]">
                  <div className="border border-[color:rgba(255,255,255,0.08)] bg-white/[0.025] px-3 py-3">
                    <div className="font-hud text-[0.54rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.48)]">
                      房间码
                    </div>
                    <div className="mt-1 truncate text-[0.95rem] text-[color:var(--text-primary)]">
                      {currentRoomId ?? '未创建'}
                    </div>
                  </div>
                  <div className="border border-[color:rgba(255,255,255,0.08)] bg-white/[0.025] px-3 py-3">
                    <div className="font-hud text-[0.54rem] uppercase tracking-[0.18em] text-[color:rgba(196,228,255,0.48)]">
                      玩家数
                    </div>
                    <div className="mt-1 text-[0.95rem] text-[color:var(--text-primary)]">
                      {playerCount}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {roomPlayers.length === 0 ? (
                    <div className="border border-[color:rgba(255,255,255,0.08)] bg-white/[0.02] px-3 py-3 text-[0.76rem] text-[color:rgba(196,228,255,0.5)]">
                      先创建或加入一个房间。
                    </div>
                  ) : (
                    roomPlayers.map((player, index) => (
                      <div
                        key={player.player_id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-[color:rgba(255,255,255,0.08)] bg-white/[0.025] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[0.86rem] text-[color:var(--text-primary)]">
                            {player.display_name}
                            {player.player_id === currentPlayerId ? ' (YOU)' : ''}
                          </div>
                          <div className="mt-1 truncate font-hud text-[0.52rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.42)]">
                            {player.player_id}
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-2 font-hud text-[0.52rem] uppercase tracking-[0.12em]">
                          <StatusBadge state={player.connected ? 'friendly' : 'neutral'}>
                            {player.connected ? 'ONLINE' : 'OFFLINE'}
                          </StatusBadge>
                          <StatusBadge state={player.ready ? 'friendly' : 'neutral'}>
                            {player.ready ? 'READY' : 'WAIT'}
                          </StatusBadge>
                          {index === 0 ? <StatusBadge state="neutral">HOST</StatusBadge> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </GlowPanel>

            <GlowPanel
              tone="neutral"
              className="border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(5,9,18,0.92)] p-4"
            >
              <div className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.58)]">
                当前状态
              </div>
              <div className="mt-3 grid gap-2 text-[0.78rem] leading-6 text-[color:var(--text-muted)]">
                <div>连接: {connectionStatus}</div>
                <div>模式: {formatRoomMode(roomMode)}</div>
                <div>房间: {roomStatusLabel(roomStatus)}</div>
                <div>可见房间成员: {otherPlayers.length}</div>
              </div>
            </GlowPanel>
          </div>
        </div>

        <motion.div
          className="pb-1 font-hud text-[0.58rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.5)]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          CREATE · JOIN · WAIT · ENTER
        </motion.div>
      </section>
    </main>
  )
}
