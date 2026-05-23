import type { FactionId } from '@/types/faction'
import type { EventPriority } from '@/types/event'
import type { GamePhase } from '@/types/phase'

export type SpeechMode = 'public' | 'private'

export type Tone = 'conciliatory' | 'threatening' | 'pragmatic' | 'ceremonial'

export type PrivateMessage = {
  id: string
  createdAt: number
  epoch: number
  turn: number
  phase: GamePhase
  from: FactionId
  to: FactionId
  priority: EventPriority
  subject: string
  body: string
  encrypted: boolean
  payload: Record<string, unknown>
}
