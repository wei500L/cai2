export const FACTION_IDS = [
  'ironCrown',
  'starlight',
  'emerald',
  'ashen',
  'voidChurch',
  'aurora',
  'magma',
  'darkTide',
] as const

export type FactionId = (typeof FACTION_IDS)[number]

export const SpeechStyle = {
  CommandingImperial: 'commanding_imperial',
  AnalyticalDiplomatic: 'analytical_diplomatic',
  CharmingMercantile: 'charming_mercantile',
  PassionateWarrior: 'passionate_warrior',
  MysticalProphetic: 'mystical_prophetic',
  AcademicNeutral: 'academic_neutral',
  GruffPragmatic: 'gruff_pragmatic',
  SmoothConspiratorial: 'smooth_conspiratorial',
} as const

export type SpeechStyle = (typeof SpeechStyle)[keyof typeof SpeechStyle]

export type FactionMeta = {
  id: FactionId
  name: string
  civilization: string
  archetype: string
  advantage: string
  speech_style: SpeechStyle
  speech_style_description: string
  slogan: string
  trigger_words: string[]
  intel_capable: boolean
  primary: string
  glow: string
  shadow: string
}

export type FactionState = {
  id: FactionId
  military: number
  economy: number
  diplomacy: number
  culture: number
  morale: number
  totalPower: number
  status: 'thriving' | 'stable' | 'declining' | 'critical' | 'eliminated'
}
