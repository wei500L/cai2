import { useCallback } from 'react'
import type { FactionId } from '@/types/faction'
import type { GameEvent } from '@/types'
import { useUIStore } from '@/store/uiStore'

function getPayloadRegionId(payload: Record<string, unknown>) {
  const value = payload.region_id ?? payload.regionId
  return typeof value === 'string' ? value : undefined
}

export function useEventFocus() {
  const setMapFocus = useUIStore((state) => state.setMapFocus)

  return useCallback(
    (event: GameEvent) => {
      const regionId = getPayloadRegionId(event.payload)
      const factionId = event.actor ?? event.target
      const focus = {
        regionId,
        factionId: factionId as FactionId | undefined,
      }

      setMapFocus(focus)
      console.info('[EventStream] mapFocus', {
        eventId: event.id,
        actor: event.actor,
        target: event.target,
        ...focus,
      })
    },
    [setMapFocus],
  )
}
