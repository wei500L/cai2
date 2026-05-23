import type { FactionId } from '@/types/faction'
import type { GameEvent } from '@/types/event'
import type { GamePhase } from '@/types/phase'
import type { PrivateMessage } from '@/types/speech'
import type { RelationshipStatus } from '@/types/treaty'

export type ReplayTimelineNode = {
  epoch: number
  turn: number
  phase: GamePhase
  keyEventIds: string[]
}

export type AIInnerThought = {
  factionId: FactionId
  epoch: number
  turn: number
  text: string
}

export type FactionCurve = {
  factionId: FactionId
  points: Array<{ epoch: number; turn: number; totalPower: number }>
}

export type RelationshipMatrix = Record<FactionId, Record<FactionId, RelationshipStatus>>

export type RelationshipSnapshot = {
  epoch: number
  matrix: RelationshipMatrix
}

export type DeceptionStat = {
  factionId: FactionId
  lies: number
  exposed: number
  successRate: number
}

export type KeyMoment = {
  id: string
  epoch: number
  turn: number
  title: string
  caption: string
  eventId: string
  factionId?: FactionId
}

export type ReplayDTO = {
  room_id: string
  generated_at_ms: number
  mode: string
  total_epochs: number
  total_turns: number
  timeline: Array<Record<string, unknown>>
  public_events: Array<Record<string, unknown>>
  private_messages: Array<Record<string, unknown>>
  ai_internal_thoughts: Array<Record<string, unknown>>
  faction_curves: Array<Record<string, unknown>>
  relationship_snapshots: Array<Record<string, unknown>>
  key_moments: Array<Record<string, unknown>>
  famous_quotes: Array<Record<string, unknown>>
  betrayal_events: Array<Record<string, unknown>>
  deception_stats: Array<Record<string, unknown>>
  final_factions: Array<Record<string, unknown>>
  winner: FactionId | null
  final_narration: string
}

export type ReplayData = {
  timeline: ReplayTimelineNode[]
  privateMessages: PrivateMessage[]
  aiInnerThoughts: AIInnerThought[]
  factionCurves: FactionCurve[]
  relationshipSnapshots: RelationshipSnapshot[]
  deceptionStats: DeceptionStat[]
  events: GameEvent[]
  keyMoments: KeyMoment[]
}
