import { useMemo } from 'react'
import { FACTIONS } from '@/mock/factions'
import type { CommandMode, ToneAnalysis, ToneBand } from './types'

type WeightedWord = {
  word: string
  weight: number
}

const hostileWords: WeightedWord[] = [
  { word: '宣战', weight: 34 },
  { word: '攻击', weight: 22 },
  { word: '毁灭', weight: 30 },
  { word: '消灭', weight: 28 },
  { word: '征服', weight: 24 },
  { word: '威胁', weight: 24 },
  { word: '报复', weight: 22 },
  { word: '背叛', weight: 28 },
  { word: '臣服', weight: 22 },
  { word: '投降', weight: 20 },
  { word: '弱者', weight: 18 },
  { word: '懦夫', weight: 18 },
  { word: '战争', weight: 20 },
  { word: 'war', weight: 28 },
  { word: 'attack', weight: 24 },
]

const cooperativeWords: WeightedWord[] = [
  { word: '合作', weight: 18 },
  { word: '和平', weight: 18 },
  { word: '同盟', weight: 18 },
  { word: '贸易', weight: 16 },
  { word: '互利', weight: 14 },
  { word: '停战', weight: 16 },
  { word: '共享', weight: 12 },
  { word: '信任', weight: 14 },
  { word: '保证', weight: 12 },
  { word: 'alliance', weight: 18 },
  { word: 'trade', weight: 16 },
]

const deceptiveWords: WeightedWord[] = [
  { word: '秘密', weight: 20 },
  { word: '暗中', weight: 22 },
  { word: '隐蔽', weight: 20 },
  { word: '密使', weight: 18 },
  { word: '筹码', weight: 16 },
  { word: '交换', weight: 12 },
  { word: '渗透', weight: 24 },
  { word: '监听', weight: 20 },
  { word: 'spy', weight: 22 },
]

const factionTriggerWords: WeightedWord[] = FACTIONS.flatMap((faction) =>
  faction.triggerWords.map((word) => ({ word, weight: 10 })),
)

function scoreWords(text: string, words: WeightedWord[]) {
  let score = 0
  const matched: string[] = []
  const normalized = text.toLowerCase()

  for (const item of words) {
    if (normalized.includes(item.word.toLowerCase())) {
      score += item.weight
      matched.push(item.word)
    }
  }

  return { score, matched }
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function analyzeTone(content: string, mode: CommandMode): ToneAnalysis {
  const hostile = scoreWords(content, hostileWords)
  const cooperative = scoreWords(content, cooperativeWords)
  const deceptive = scoreWords(content, deceptiveWords)
  const triggers = scoreWords(content, factionTriggerWords)
  const exclamationBoost = Math.min(12, (content.match(/[!！]/g)?.length ?? 0) * 4)
  const modeBoost = mode === 'military' ? 10 : mode === 'private' ? 4 : 0
  const heat = clamp(18 + hostile.score + deceptive.score * 0.34 + triggers.score * 0.45 + exclamationBoost + modeBoost - cooperative.score * 0.42)
  const cooperation = clamp(cooperative.score)
  const deception = clamp(deceptive.score + (mode === 'private' ? 12 : 0))
  const hostility = clamp(hostile.score + exclamationBoost)
  const trust = clamp(cooperative.score + (content.includes('保证') ? 12 : 0) - deceptive.score * 0.35)
  const label: ToneBand =
    heat >= 72 ? 'aggressive' : deception >= 34 ? 'deceptive' : cooperation >= 26 ? 'cooperative' : 'calm'

  return {
    heat,
    label,
    hostility,
    cooperation,
    deception,
    trust,
    isAggressive: heat >= 72,
    matched: [...hostile.matched, ...cooperative.matched, ...deceptive.matched, ...triggers.matched].slice(0, 6),
  }
}

export function useToneAnalyzer(content: string, mode: CommandMode) {
  return useMemo(() => analyzeTone(content, mode), [content, mode])
}
