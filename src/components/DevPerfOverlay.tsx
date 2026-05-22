import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

export function DevPerfOverlay() {
  const open = useUIStore((state) => state.devOverlayOpen)
  const fps = useUIStore((state) => state.perfFps)
  const particleCount = useUIStore((state) => state.perfParticleCount)
  const density = useUIStore((state) => state.globalParticleDensity)
  const effectsDegraded = useUIStore((state) => state.effectsDegraded)
  const phase = useGameStore((state) => state.epoch.phase)
  const arbitratePhase = useGameStore((state) => state.epoch.arbitratePhase)

  if (!import.meta.env.DEV || !open) {
    return null
  }

  return (
    <div className="fixed bottom-3 right-3 z-[130] border border-[color:rgba(51,170,255,0.32)] bg-[color:rgba(0,0,0,0.82)] px-3 py-2 font-hud text-[0.54rem] uppercase tracking-[0.14em] text-[color:var(--text-muted)] shadow-[0_0_18px_rgba(51,170,255,0.18)]">
      <span className="text-[color:var(--border-glow)]">FPS</span> {fps.toFixed(0)} /{' '}
      <span className="text-[color:var(--border-glow)]">PARTICLES</span> {particleCount} /{' '}
      <span className="text-[color:var(--border-glow)]">PHASE</span> {phase}
      {arbitratePhase ? `:${arbitratePhase}` : ''} / <span className="text-[color:var(--border-glow)]">DENSITY</span>{' '}
      {density}
      {effectsDegraded ? ' / FX LOW' : ''}
    </div>
  )
}
