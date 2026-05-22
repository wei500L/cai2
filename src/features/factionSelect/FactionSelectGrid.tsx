import type { RefCallback } from 'react'
import type { FactionMeta, FactionId } from '@/mock/factions'
import { FactionCard } from './FactionCard'

type FactionSelectGridProps = {
  factions: FactionMeta[]
  selectedFactionId: FactionId | null
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelectFaction: (faction: FactionMeta) => void
  registerCardRef: (index: number) => RefCallback<HTMLButtonElement>
}

export function FactionSelectGrid({
  factions,
  selectedFactionId,
  activeIndex,
  onActiveIndexChange,
  onSelectFaction,
  registerCardRef,
}: FactionSelectGridProps) {
  return (
    <div aria-label="势力列表" className="grid gap-4 sm:grid-cols-2">
      {factions.map((faction, index) => (
        <FactionCard
          key={faction.id}
          ref={registerCardRef(index)}
          faction={faction}
          selected={selectedFactionId === faction.id}
          active={activeIndex === index}
          onFocusCard={() => onActiveIndexChange(index)}
          onSelectCard={() => onSelectFaction(faction)}
        />
      ))}
    </div>
  )
}
