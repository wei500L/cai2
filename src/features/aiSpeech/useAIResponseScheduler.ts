import { useEffect, useRef } from 'react'
import { clearAIResponseTimers, triggerAIResponses } from '@/mock/aiResponder'
import { useGameStore } from '@/store/gameStore'

export function useAIResponseScheduler() {
  const handledEventIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    handledEventIds.current = new Set(useGameStore.getState().events.map((event) => event.id))

    const unsubscribe = useGameStore.subscribe((state) => {
      const freshEvents = state.events.filter((event) => !handledEventIds.current.has(event.id))

      if (freshEvents.length === 0) {
        return
      }

      for (const event of freshEvents) {
        handledEventIds.current.add(event.id)
      }

      for (const event of [...freshEvents].reverse()) {
        triggerAIResponses(event)
      }
    })

    return () => {
      unsubscribe()
      clearAIResponseTimers()
    }
  }, [])
}
