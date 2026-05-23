import type { MapQuality } from '@/store/uiStore'

export function shouldEnableCameraDirector(mapQuality: MapQuality, cinematicEnabled: boolean) {
  return mapQuality === 'high' && cinematicEnabled
}
