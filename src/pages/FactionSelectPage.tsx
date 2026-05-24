import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FactionMetaPlaceholder } from '@/components/FactionMetaPlaceholder'
import { Scanlines } from '@/components/Scanlines'
import { ConfirmBar } from '@/features/factionSelect/ConfirmBar'
import { FactionDetailPanel } from '@/features/factionSelect/FactionDetailPanel'
import { FactionSelectGrid } from '@/features/factionSelect/FactionSelectGrid'
import { useAllFactionMeta, factionMetaStore } from '@/store/factionMetaStore'
import { FACTION_IDS, type FactionMeta } from '@/types/faction'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { useGameStore } from '@/store/gameStore'

const GRID_COLUMNS_DESKTOP = 2

function getColumnsCount() {
  if (typeof window === 'undefined') {
    return GRID_COLUMNS_DESKTOP
  }

  return window.matchMedia('(min-width: 640px)').matches ? GRID_COLUMNS_DESKTOP : 1
}

function getFactionIndex(factionId: string | null, factions: FactionMeta[]) {
  if (!factionId) {
    return 0
  }

  const index = factions.findIndex((faction) => faction.id === factionId)
  return index >= 0 ? index : 0
}

function getFactionLabel(factionId: string | null) {
  const meta = factionId ? factionMetaStore.getState().byId[factionId as FactionMeta['id']] : null
  return meta?.name ?? factionId ?? '未选择'
}

export default function FactionSelectPage() {
  const factions = useAllFactionMeta()
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const currentRoomId = useGameStore((state) => state.currentRoomId)
  const currentPlayerId = useGameStore((state) => state.currentPlayerId)
  const roomPlayers = useGameStore((state) => state.roomPlayers)
  const selectFaction = useGameStore((state) => state.selectFaction)
  const clearFaction = useGameStore((state) => state.clearFaction)
  const selectedFaction = useMemo(() => factions.find((faction) => faction.id === selectedFactionId) ?? null, [
    factions,
    selectedFactionId,
  ])
  const factionsKey = useMemo(() => factions.map((faction) => faction.id).join('|'), [factions])
  const selectedFactionIndex = useMemo(
    () => getFactionIndex(selectedFactionId, factions),
    [factions, selectedFactionId],
  )
  const otherRoomPlayers = useMemo(
    () =>
      currentPlayerId
        ? roomPlayers.filter((player) => player.player_id !== currentPlayerId)
        : roomPlayers,
    [currentPlayerId, roomPlayers],
  )
  const [activeIndexState, setActiveIndexState] = useState(() => ({
    factionsKey,
    index: selectedFactionIndex,
    selectedFactionId,
  }))
  const rawActiveIndex =
    activeIndexState.selectedFactionId === selectedFactionId && activeIndexState.factionsKey === factionsKey
      ? activeIndexState.index
      : selectedFactionIndex
  const activeIndex = Math.min(Math.max(rawActiveIndex, 0), Math.max(factions.length - 1, 0))
  const setActiveIndex = useCallback(
    (index: number) => {
      setActiveIndexState((current) => {
        if (
          current.factionsKey === factionsKey &&
          current.selectedFactionId === selectedFactionId &&
          current.index === index
        ) {
          return current
        }

        return { factionsKey, index, selectedFactionId }
      })
    },
    [factionsKey, selectedFactionId],
  )
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  const commitFactionSelection = useCallback(
    (factionId: FactionMeta['id']) => {
      selectFaction(factionId)
      if (currentRoomId) {
        ActionDispatcher.selectFaction(factionId)
      }
    },
    [currentRoomId, selectFaction],
  )

  useEffect(() => {
    const activeCard = cardRefs.current[activeIndex]
    activeCard?.focus()
  }, [activeIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (target instanceof HTMLButtonElement && target.getAttribute('aria-pressed') === null) {
        return
      }

      const columns = getColumnsCount()
      const currentIndex = activeIndex
      const lastIndex = factions.length - 1
      if (lastIndex < 0) {
        return
      }

      if (event.key === 'ArrowLeft' && columns > 1) {
        event.preventDefault()
        const nextIndex = currentIndex % columns === 0 ? currentIndex : currentIndex - 1
        setActiveIndex(nextIndex)
        cardRefs.current[nextIndex]?.focus()
      }

      if (event.key === 'ArrowRight' && columns > 1) {
        event.preventDefault()
        const nextIndex =
          currentIndex % columns === columns - 1 || currentIndex === lastIndex
            ? currentIndex
            : currentIndex + 1
        setActiveIndex(nextIndex)
        cardRefs.current[nextIndex]?.focus()
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const nextIndex = currentIndex - columns >= 0 ? currentIndex - columns : currentIndex
        setActiveIndex(nextIndex)
        cardRefs.current[nextIndex]?.focus()
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = currentIndex + columns <= lastIndex ? currentIndex + columns : currentIndex
        setActiveIndex(nextIndex)
        cardRefs.current[nextIndex]?.focus()
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        clearFaction()
        const resetIndex = 0
        setActiveIndex(resetIndex)
        cardRefs.current[resetIndex]?.focus()
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const faction = factions[currentIndex]
        if (faction) {
          commitFactionSelection(faction.id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, clearFaction, commitFactionSelection, factions, setActiveIndex])

  const registerCardRef =
    (index: number) =>
    (element: HTMLButtonElement | null): void => {
      cardRefs.current[index] = element
    }

  const handleSelectFaction = (faction: FactionMeta) => {
    const index = factions.findIndex((item) => item.id === faction.id)
    if (index >= 0) {
      setActiveIndex(index)
    }
    commitFactionSelection(faction.id)
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
      <div
        aria-hidden
        className="absolute inset-0 opacity-50"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(51,170,255,0.08) 50%, transparent 100%)',
          transform: 'translateY(-20vh) skewY(-8deg)',
        }}
      />
      <Scanlines className="z-[5] opacity-40" />

      <section className="relative z-10 flex min-h-screen flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-start justify-between gap-4 border-b border-[color:rgba(255,255,255,0.08)] pb-3 font-hud">
          <div className="grid gap-2">
            <div className="text-[0.66rem] uppercase tracking-[0.32em] text-[color:rgba(196,228,255,0.54)]">
              Diplomacy Backend
            </div>
            <h1 className="text-[1.25rem] font-semibold leading-none tracking-[0.08em] text-[color:var(--text-primary)]">
              外交风云
            </h1>
          </div>
          <div className="text-right text-[0.62rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.48)]">
            8 factions
          </div>
        </header>

        <div className="grid flex-1 gap-4 py-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
          <div className="grid gap-4">
            {factions.length === 0 ? (
              <div aria-label="势力列表载入中" className="grid gap-4 sm:grid-cols-2">
                {FACTION_IDS.map((factionId) => (
                  <FactionMetaPlaceholder key={factionId} factionId={factionId} className="min-h-[18rem]" />
                ))}
              </div>
            ) : (
              <FactionSelectGrid
                factions={factions}
                selectedFactionId={selectedFactionId}
                activeIndex={activeIndex}
                onActiveIndexChange={setActiveIndex}
                onSelectFaction={handleSelectFaction}
                registerCardRef={registerCardRef}
              />
            )}
          </div>

          <div className="grid content-start gap-4 xl:sticky xl:top-4">
            <FactionDetailPanel faction={selectedFaction} />
            {currentRoomId ? (
              <section className="border border-[color:rgba(255,255,255,0.1)] bg-[color:rgba(5,9,18,0.74)] p-4">
                <div className="flex items-center justify-between gap-3 font-hud">
                  <h2 className="text-[0.66rem] uppercase tracking-[0.24em] text-[color:rgba(196,228,255,0.68)]">
                    房间内其它玩家
                  </h2>
                  <span className="text-[0.56rem] tracking-[0.16em] text-[color:rgba(196,228,255,0.42)]">
                    {otherRoomPlayers.length}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {otherRoomPlayers.length === 0 ? (
                    <div className="border border-[color:rgba(255,255,255,0.06)] bg-white/[0.025] px-3 py-2 text-[0.72rem] text-[color:rgba(196,228,255,0.48)]">
                      等待其他玩家加入
                    </div>
                  ) : (
                    otherRoomPlayers.map((player) => (
                      <div
                        key={player.player_id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-[color:rgba(255,255,255,0.07)] bg-white/[0.025] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[0.82rem] text-[color:var(--text-primary)]">
                            {player.display_name}
                          </div>
                          <div className="mt-1 truncate font-hud text-[0.54rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.46)]">
                            {getFactionLabel(player.faction_id)}
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-2 font-hud text-[0.52rem] tracking-[0.12em]">
                          <span className={player.connected ? 'text-[color:rgba(112,255,166,0.86)]' : 'text-[color:rgba(196,228,255,0.42)]'}>
                            {player.connected ? '在线' : '离线'}
                          </span>
                          <span className={player.ready ? 'text-[color:var(--text-warn)]' : 'text-[color:rgba(196,228,255,0.42)]'}>
                            {player.ready ? 'READY' : 'WAIT'}
                          </span>
                          {player.ai_takeover ? (
                            <span className="text-[color:rgb(255,181,100)]">AI 托管</span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <motion.div
          className="pb-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <ConfirmBar selectedFaction={selectedFaction} />
        </motion.div>
      </section>
    </main>
  )
}
