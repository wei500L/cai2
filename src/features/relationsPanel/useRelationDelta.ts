import { useEffect, useRef, useState } from 'react'
import type { FactionId } from '@/types/faction'
import { useGameStore } from '@/store/gameStore'
import { getRelationStatus } from './relationVisuals'
import type { RelationDelta } from './types'

function relationKey(from: FactionId, to: FactionId) {
  return `${from}:${to}`
}

function snapshotRelationships() {
  const values = new Map<string, number>()

  for (const relationship of useGameStore.getState().relationships) {
    values.set(relationKey(relationship.from, relationship.to), relationship.value)
  }

  return values
}

export function useRelationDelta(activeFactionId: FactionId) {
  const previousValues = useRef<Map<string, number>>(snapshotRelationships())
  const version = useRef(0)
  const cleanupTimers = useRef<number[]>([])
  const frame = useRef<number | null>(null)
  const pending = useRef<Map<FactionId, RelationDelta>>(new Map())
  const [deltas, setDeltas] = useState<Record<string, RelationDelta>>({})

  useEffect(() => {
    previousValues.current = snapshotRelationships()
    const resetFrame = window.requestAnimationFrame(() => setDeltas({}))

    return () => window.cancelAnimationFrame(resetFrame)
  }, [activeFactionId])

  useEffect(() => {
    return useGameStore.subscribe((state) => {
      for (const relationship of state.relationships) {
        const key = relationKey(relationship.from, relationship.to)
        const previousValue = previousValues.current.get(key)

        previousValues.current.set(key, relationship.value)

        if (
          relationship.from !== activeFactionId ||
          previousValue === undefined ||
          previousValue === relationship.value
        ) {
          continue
        }

        version.current += 1
        pending.current.set(relationship.to, {
          fromValue: previousValue,
          toValue: relationship.value,
          direction: relationship.value >= previousValue ? 1 : -1,
          enteredHostile:
            getRelationStatus(previousValue) !== 'hostile' &&
            getRelationStatus(relationship.value) === 'hostile',
          version: version.current,
        })
      }

      if (pending.current.size === 0 || frame.current !== null) {
        return
      }

      frame.current = window.requestAnimationFrame(() => {
        frame.current = null
        const next: Record<string, RelationDelta> = Object.fromEntries(pending.current.entries())
        pending.current.clear()
        setDeltas((current) => ({ ...current, ...next }))

        const timer = window.setTimeout(() => {
          setDeltas((current) => {
            const copy = { ...current }

            for (const factionId of Object.keys(next)) {
              if (copy[factionId]?.version === next[factionId].version) {
                delete copy[factionId]
              }
            }

            return copy
          })
        }, 760)

        cleanupTimers.current.push(timer)
      })
    })
  }, [activeFactionId])

  useEffect(
    () => () => {
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current)
      }

      for (const timer of cleanupTimers.current) {
        window.clearTimeout(timer)
      }
    },
    [],
  )

  return deltas
}
