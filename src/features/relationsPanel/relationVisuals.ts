import type { CSSProperties } from 'react'
import type { FactionId } from '@/types/faction'
import type { RelationshipStatus, TreatyKind } from '@/types'

export const statusLabels: Record<RelationshipStatus, string> = {
  hostile: '敌对',
  wary: '警惕',
  neutral: '中立',
  friendly: '友好',
  allied: '同盟',
}

export const statusTone: Record<
  RelationshipStatus,
  { border: string; glow: string; fill: string; text: string }
> = {
  hostile: {
    border: 'rgba(255, 94, 94, 0.9)',
    glow: 'rgba(255, 46, 46, 0.46)',
    fill: 'rgba(255, 54, 54, 0.13)',
    text: 'rgb(255, 132, 132)',
  },
  wary: {
    border: 'rgba(255, 156, 64, 0.88)',
    glow: 'rgba(255, 138, 40, 0.34)',
    fill: 'rgba(255, 137, 42, 0.12)',
    text: 'rgb(255, 181, 100)',
  },
  neutral: {
    border: 'rgba(160, 174, 190, 0.66)',
    glow: 'rgba(148, 163, 184, 0.26)',
    fill: 'rgba(148, 163, 184, 0.09)',
    text: 'rgb(203, 213, 225)',
  },
  friendly: {
    border: 'rgba(54, 216, 218, 0.88)',
    glow: 'rgba(30, 210, 226, 0.36)',
    fill: 'rgba(31, 209, 226, 0.12)',
    text: 'rgb(126, 241, 246)',
  },
  allied: {
    border: 'rgba(255, 210, 96, 0.92)',
    glow: 'rgba(255, 204, 84, 0.44)',
    fill: 'rgba(255, 202, 74, 0.14)',
    text: 'rgb(255, 220, 126)',
  },
}

export const treatyLabels: Record<TreatyKind, string> = {
  non_aggression: '互不侵犯',
  trade: '贸易',
  alliance: '同盟',
  ceasefire: '停火',
}

export const treatyIcons: Record<TreatyKind, string> = {
  non_aggression: '⊘',
  trade: '⇄',
  alliance: '★',
  ceasefire: '⌁',
}

export const metricLabels = {
  military: '军事',
  economy: '经济',
  diplomacy: '外交',
  culture: '文化',
} as const

export function getRelationStatus(value: number): RelationshipStatus {
  if (value <= -60) {
    return 'hostile'
  }

  if (value < -20) {
    return 'wary'
  }

  if (value <= 20) {
    return 'neutral'
  }

  if (value < 60) {
    return 'friendly'
  }

  return 'allied'
}

export function getTreatyTurnsLeft(kind: TreatyKind, from: FactionId, to: FactionId, turn = 1) {
  const key = `${kind}:${from}:${to}`
  let hash = 17

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 997
  }

  return 1 + ((hash + turn) % 6)
}

export function getStatusStyle(status: RelationshipStatus): CSSProperties {
  const tone = statusTone[status]

  return {
    borderColor: tone.border,
    color: tone.text,
    background: tone.fill,
    boxShadow: `0 0 0 1px ${tone.border}, 0 0 12px ${tone.glow}`,
  }
}
