export const hostileWords = [
  '宣战',
  '战争',
  '敌对',
  '清算',
  '审判',
  '威胁',
  '臣服',
  '抗拒',
  '战斗',
  '背叛',
  '开战',
  '攻击',
]

export const cooperativeWords = [
  '合作',
  '和平',
  '盟约',
  '同盟',
  '贸易',
  '互利',
  '共赢',
  '担保',
  '谈判',
  '承诺',
  '停战',
  '伙伴',
]

export const deceptiveWords = [
  '秘密',
  '暗线',
  '私下',
  '沉默',
  '附款',
  '假装',
  '风声',
  '名单',
  '泄露',
  '阴影',
]

export type KeywordTone = 'hostile' | 'cooperative' | 'deceptive' | 'neutral'

export function getKeywordTone(word: string): KeywordTone {
  if (hostileWords.includes(word)) {
    return 'hostile'
  }

  if (cooperativeWords.includes(word)) {
    return 'cooperative'
  }

  if (deceptiveWords.includes(word)) {
    return 'deceptive'
  }

  return 'neutral'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function splitByKeywords(text: string) {
  const words = [...hostileWords, ...cooperativeWords, ...deceptiveWords].sort(
    (left, right) => right.length - left.length,
  )
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'g')

  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      tone: getKeywordTone(part),
    }))
}
