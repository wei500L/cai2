import type { FactionId } from '@/types/faction'
import type { RelationshipStatus, TreatyKind } from '@/types'

export type RelationsTab = 'factions' | 'treaties' | 'intel'

export type RelationDelta = {
  fromValue: number
  toValue: number
  direction: 1 | -1
  enteredHostile: boolean
  version: number
}

export type TreatyDisplay = {
  kind: TreatyKind
  turnsLeft: number
}

export type RelationVisualStatus = RelationshipStatus

export type ContextMenuState = {
  factionId: FactionId
  x: number
  y: number
} | null
