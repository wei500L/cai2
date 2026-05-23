import type { FactionId } from '@/types/faction'
import type { TreatyKind } from '@/types'

export type CommandMode = 'speech' | 'private' | 'treaty' | 'military' | 'intel'

export type MilitaryAction = 'move' | 'attack' | 'defend'

export type ToneBand = 'calm' | 'cooperative' | 'deceptive' | 'aggressive'

export type ToneAnalysis = {
  heat: number
  label: ToneBand
  hostility: number
  cooperation: number
  deception: number
  trust: number
  isAggressive: boolean
  matched: string[]
}

export type InfluenceLevel = 'low' | 'medium' | 'high'

export type MilitaryOrder = {
  unitId: string
  sourceRegionId: string
  targetRegionId: string
  action: MilitaryAction
}

export type CommandSubmission = {
  mode: CommandMode
  content: string
  targets: FactionId[]
  treatyKind?: TreatyKind
  military?: MilitaryOrder
  tone?: Pick<ToneAnalysis, 'heat' | 'label' | 'isAggressive'>
}

export type SubmitSpeechResult = {
  ok: boolean
  error?: string
  eventId?: string
}

export const commandModeLabels: Record<CommandMode, string> = {
  speech: '演讲',
  private: '密谈',
  treaty: '条约',
  military: '军令',
  intel: '情报',
}

export const commandModes = Object.keys(commandModeLabels) as CommandMode[]

export const treatyKindLabels: Record<TreatyKind, string> = {
  non_aggression: '互不侵犯',
  trade: '贸易',
  alliance: '同盟',
  ceasefire: '停战',
}

export const militaryActionLabels: Record<MilitaryAction, string> = {
  move: '推进',
  attack: '攻击',
  defend: '固守',
}
