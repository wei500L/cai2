export const factionIds = [
  'ironCrown',
  'starlight',
  'emerald',
  'ashen',
  'voidChurch',
  'aurora',
  'magma',
  'darkTide',
] as const

export type FactionId = (typeof factionIds)[number]

export type RelationState = 'hostile' | 'neutral' | 'friendly' | 'ally'

export const factionLabels: Record<FactionId, string> = {
  ironCrown: '铁冠帝国',
  starlight: '星辉联邦',
  emerald: '翡翠王庭',
  ashen: '灰烬部族',
  voidChurch: '虚空教廷',
  aurora: '极光共和',
  magma: '熔岩议会',
  darkTide: '暗潮商会',
}

export const factionTokens: Record<
  FactionId,
  { primary: string; glow: string; shadow: string }
> = {
  ironCrown: {
    primary: 'var(--faction-ironCrown-primary)',
    glow: 'var(--faction-ironCrown-glow)',
    shadow: 'var(--faction-ironCrown-shadow)',
  },
  starlight: {
    primary: 'var(--faction-starlight-primary)',
    glow: 'var(--faction-starlight-glow)',
    shadow: 'var(--faction-starlight-shadow)',
  },
  emerald: {
    primary: 'var(--faction-emerald-primary)',
    glow: 'var(--faction-emerald-glow)',
    shadow: 'var(--faction-emerald-shadow)',
  },
  ashen: {
    primary: 'var(--faction-ashen-primary)',
    glow: 'var(--faction-ashen-glow)',
    shadow: 'var(--faction-ashen-shadow)',
  },
  voidChurch: {
    primary: 'var(--faction-voidChurch-primary)',
    glow: 'var(--faction-voidChurch-glow)',
    shadow: 'var(--faction-voidChurch-shadow)',
  },
  aurora: {
    primary: 'var(--faction-aurora-primary)',
    glow: 'var(--faction-aurora-glow)',
    shadow: 'var(--faction-aurora-shadow)',
  },
  magma: {
    primary: 'var(--faction-magma-primary)',
    glow: 'var(--faction-magma-glow)',
    shadow: 'var(--faction-magma-shadow)',
  },
  darkTide: {
    primary: 'var(--faction-darkTide-primary)',
    glow: 'var(--faction-darkTide-glow)',
    shadow: 'var(--faction-darkTide-shadow)',
  },
}

export const relationLabels: Record<RelationState, string> = {
  hostile: '敌对',
  neutral: '中立',
  friendly: '友好',
  ally: '同盟',
}

export const relationTokens: Record<
  RelationState,
  { border: string; glow: string; fill: string; text: string }
> = {
  hostile: {
    border: 'var(--text-hostile)',
    glow: 'rgba(255, 102, 102, 0.45)',
    fill: 'rgba(255, 102, 102, 0.1)',
    text: 'var(--text-hostile)',
  },
  neutral: {
    border: 'var(--border-glow)',
    glow: 'rgba(51, 170, 255, 0.35)',
    fill: 'rgba(51, 170, 255, 0.08)',
    text: 'var(--text-primary)',
  },
  friendly: {
    border: 'var(--text-warn)',
    glow: 'rgba(255, 204, 102, 0.34)',
    fill: 'rgba(255, 204, 102, 0.08)',
    text: 'var(--text-warn)',
  },
  ally: {
    border: 'var(--faction-aurora-glow)',
    glow: 'rgba(51, 255, 255, 0.5)',
    fill: 'rgba(51, 255, 255, 0.1)',
    text: 'var(--faction-aurora-glow)',
  },
}

export const resolveFactionId = (value?: string | null): FactionId | null => {
  if (!value) {
    return null
  }

  return (factionIds as readonly string[]).includes(value) ? (value as FactionId) : null
}

