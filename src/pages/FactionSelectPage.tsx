import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Scanlines } from '@/components/Scanlines'
import { ConfirmBar } from '@/features/factionSelect/ConfirmBar'
import { FactionDetailPanel } from '@/features/factionSelect/FactionDetailPanel'
import { FactionSelectGrid } from '@/features/factionSelect/FactionSelectGrid'
import { FACTIONS, type FactionMeta } from '@/mock/factions'
import { useGameStore } from '@/store/gameStore'

const GRID_COLUMNS_DESKTOP = 2

function getColumnsCount() {
  if (typeof window === 'undefined') {
    return GRID_COLUMNS_DESKTOP
  }

  return window.matchMedia('(min-width: 640px)').matches ? GRID_COLUMNS_DESKTOP : 1
}

function getFactionIndex(factionId: string | null) {
  if (!factionId) {
    return 0
  }

  const index = FACTIONS.findIndex((faction) => faction.id === factionId)
  return index >= 0 ? index : 0
}

export default function FactionSelectPage() {
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const selectFaction = useGameStore((state) => state.selectFaction)
  const clearFaction = useGameStore((state) => state.clearFaction)
  const selectedFaction = useMemo(
    () => FACTIONS.find((faction) => faction.id === selectedFactionId) ?? null,
    [selectedFactionId],
  )
  const [activeIndex, setActiveIndex] = useState(() => getFactionIndex(selectedFactionId))
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

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
      const lastIndex = FACTIONS.length - 1

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
        selectFaction(FACTIONS[currentIndex].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, clearFaction, selectFaction])

  const registerCardRef =
    (index: number) =>
    (element: HTMLButtonElement | null): void => {
      cardRefs.current[index] = element
    }

  const handleSelectFaction = (faction: FactionMeta) => {
    const index = FACTIONS.findIndex((item) => item.id === faction.id)
    if (index >= 0) {
      setActiveIndex(index)
    }
    selectFaction(faction.id)
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
            <FactionSelectGrid
              factions={FACTIONS}
              selectedFactionId={selectedFactionId}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onSelectFaction={handleSelectFaction}
              registerCardRef={registerCardRef}
            />
          </div>

          <div className="xl:sticky xl:top-4">
            <FactionDetailPanel faction={selectedFaction} />
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
