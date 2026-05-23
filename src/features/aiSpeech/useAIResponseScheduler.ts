import { useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'

export function useAIResponseScheduler() {
  const lastAIThinking = useGameStore((state) => state.lastAIThinking)
  const lastAISpeak = useGameStore((state) => state.lastAISpeak)
  const lastAIReaction = useGameStore((state) => state.lastAIReaction)

  useEffect(() => {
    return undefined
  }, [lastAIThinking, lastAISpeak, lastAIReaction])
}
