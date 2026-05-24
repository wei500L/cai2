import { MapStage2D } from '@/render/MapStage2D'
import { MapStageR3F } from '@/render/MapStageR3F'
import { MapStageGlobe } from '@/render/MapStageGlobe'
import { useMapStore } from '@/store/mapStore'

export function MapSwitcher({
  zoom = 1,
  transitionMs = 400,
}: {
  zoom?: number
  transitionMs?: number
}) {
  const renderer = useMapStore((state) => state.renderer)

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      {renderer === 'globe' ? (
        <MapStageGlobe key={renderer} zoom={zoom} transitionMs={transitionMs} />
      ) : renderer === 'r3f' ? (
        <MapStageR3F key={renderer} />
      ) : (
        <MapStage2D key={renderer} />
      )}
    </div>
  )
}
