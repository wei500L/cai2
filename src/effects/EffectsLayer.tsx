import { useRef } from 'react'
import type { MapQuality } from '@/store/uiStore'
import { useEffectsBus } from './useEffectsBus'
import { BattleResultCard } from './war/BattleResultCard'

type EffectsLayerProps = {
  mapQuality: MapQuality
}

export function EffectsLayer({ mapQuality }: EffectsLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const { battleCard, dismissBattleCard } = useEffectsBus({ canvasRef, mapQuality })

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[15] h-full w-full mix-blend-screen"
      />
      <div className="pointer-events-none absolute inset-0 z-[55]">
        <BattleResultCard card={battleCard} onClose={dismissBattleCard} />
      </div>
    </>
  )
}
