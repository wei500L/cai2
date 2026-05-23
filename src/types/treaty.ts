import type { FactionId } from '@/types/faction'

export type RelationshipValue = number

export type RelationshipStatus = 'hostile' | 'wary' | 'neutral' | 'friendly' | 'allied'

export type TreatyKind = 'non_aggression' | 'trade' | 'alliance' | 'ceasefire'

export type TreatyState = {
  id: string
  kind: TreatyKind
  parties: FactionId[]
  started_epoch: number
  started_turn: number
  ends_epoch: number | null
  ends_turn: number | null
  active: boolean
  metadata: Record<string, unknown>
}

export type Treaty = TreatyState

export type Relationship = {
  from: FactionId
  to: FactionId
  value: RelationshipValue
  status: RelationshipStatus
  treaties: TreatyKind[]
}
