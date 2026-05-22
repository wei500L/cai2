import { useEffect, useRef } from 'react'
import { clearAIResponseTimers, triggerAIResponses } from '@/mock/aiResponder'
import { useGameStore } from '@/store/gameStore'

export function useAIResponseScheduler() {
  const latestHandledEventId = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state) => {
      const latestEvent = state.events[0]

      if (!latestEvent || latestEvent.id === latestHandledEventId.current) {
        return
      }

      latestHandledEventId.current = latestEvent.id
      triggerAIResponses(latestEvent)
    })

    return () => {
      unsubscribe()
      clearAIResponseTimers()
    }
  }, [])
}
