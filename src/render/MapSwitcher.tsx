import { MapStage2D } from '@/render/MapStage2D'
import { MapStageR3F } from '@/render/MapStageR3F'
import { MapStageGlobe } from '@/render/MapStageGlobe'
import { useMapStore } from '@/store/mapStore'

export function MapSwitcher() {
  const renderer = useMapStore((state) => state.renderer)
  const Stage = renderer === 'globe' ? MapStageGlobe : renderer === 'r3f' ? MapStageR3F : MapStage2D

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      <Stage key={renderer} />
    </div>
  )
}

