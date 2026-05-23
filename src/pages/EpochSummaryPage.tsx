import { AnimatePresence } from 'framer-motion'
import { EpochSummaryPanel } from '@/features/epochSummary/EpochSummaryPanel'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

export default function EpochSummaryPage() {
  const epochPhase = useGameStore((state) => state.epoch.phase)
  const arbitratePhase = useGameStore((state) => state.epoch.arbitratePhase)
  const hudMode = useUIStore((state) => state.hudMode)
  const visible = hudMode === 'arbitrate-summary' && epochPhase === 'arbitrate' && arbitratePhase === 'summary'

  return <AnimatePresence>{visible ? <EpochSummaryPanel key="epoch-summary-overlay" /> : null}</AnimatePresence>
}
