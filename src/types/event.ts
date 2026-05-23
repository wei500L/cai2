import type { FactionId } from '@/types/faction'
import type { GamePhase } from '@/types/phase'
import type { SpeechMode, Tone } from '@/types/speech'

export type EventPriority = 'P0' | 'P1' | 'P2'

export type EventKind =
  | 'speech'
  | 'private'
  | 'declare_war'
  | 'alliance'
  | 'trade'
  | 'non_aggression'
  | 'ceasefire'
  | 'betrayal'
  | 'battle'
  | 'invasion'
  | 'siege'
  | 'bombing'
  | 'naval_assault'
  | 'uprising'
  | 'nuclear_strike'
  | 'economy'
  | 'intel'
  | 'phase_change'
  | 'ai_thinking'
  | 'ai_reaction'
  | 'narration'

export type EventActor = FactionId | null

export type GameEvent = {
  id: string
  seq?: number
  createdAt: number
  epoch: number
  turn: number
  phase: GamePhase
  priority: EventPriority
  kind: EventKind
  actor?: EventActor
  target?: EventActor
  payload: Record<string, unknown>
  narration: string
}

export type SpeechEvent = GameEvent & {
  kind: 'speech'
  actor: FactionId
  payload: {
    channel: SpeechMode
    stance: Tone
    text: string
  }
}
