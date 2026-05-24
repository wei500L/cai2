// @deprecated — only allowed in MockTransport + tests + dev MOCK MODE fallback.
import { factionIds, factionLabels, factionTokens } from '@/components/hudTheme'
import { SpeechStyle } from '@/types/faction'
import type { FactionMeta, FactionId } from '@/types/faction'

export type { FactionMeta, FactionId } from '@/types/faction'

export type SpeechStyleId = SpeechStyle

export const speechStyleDescriptions: Record<SpeechStyle, string> = {
  [SpeechStyle.CommandingImperial]:
    '语气短促有压迫感，常用命令句与帝国式宣告，强调服从、纪律与战功。',
  [SpeechStyle.AnalyticalDiplomatic]:
    '表达冷静克制，习惯先给结论再列证据，重视可验证事实与行动边界。',
  [SpeechStyle.CharmingMercantile]:
    '语气圆滑善谈，把合作说成双赢，把风险包装成机会，擅长把条件谈活。',
  [SpeechStyle.PassionateWarrior]:
    '语气昂扬直接，频繁使用战斗隐喻，崇尚勇气、荣耀与正面对决。',
  [SpeechStyle.MysticalProphetic]:
    '语气飘忽带预示感，偏爱宿命、神谕和象征性词汇，制造难以忽视的压力。',
  [SpeechStyle.AcademicNeutral]:
    '语气温和审慎，像学者报告，强调研究、和平方案与知识积累。',
  [SpeechStyle.GruffPragmatic]:
    '语气粗粝务实，少废话，优先讨论资源、地形、防守与收益。',
  [SpeechStyle.SmoothConspiratorial]:
    '语气低沉圆滑，喜欢暗示、交换和隐秘筹码，让人不易摸清底牌。',
}

const baseFactionMeta: Record<
  FactionId,
  Omit<FactionMeta, 'id' | 'name' | 'primary' | 'glow' | 'shadow'>
> = {
  ironCrown: {
    civilization: '军事工业化，等级森严',
    archetype: '铁血征服者',
    advantage: '军事力+20%',
    speech_style: SpeechStyle.CommandingImperial,
    speech_style_description: speechStyleDescriptions[SpeechStyle.CommandingImperial],
    slogan: '臣服，才配获得秩序。',
    trigger_words: ['臣服', '投降', '弱者'],
    intel_capable: false,
  },
  starlight: {
    civilization: '科技民主，重视规则',
    archetype: '理性合作者',
    advantage: '科技系数+1',
    speech_style: SpeechStyle.AnalyticalDiplomatic,
    speech_style_description: speechStyleDescriptions[SpeechStyle.AnalyticalDiplomatic],
    slogan: '数据证明，合作是当前最优解。',
    trigger_words: ['数据', '逻辑', '证据'],
    intel_capable: true,
  },
  emerald: {
    civilization: '商贸帝国，富可敌国',
    archetype: '狡猾商人',
    advantage: '贸易收益+30%',
    speech_style: SpeechStyle.CharmingMercantile,
    speech_style_description: speechStyleDescriptions[SpeechStyle.CharmingMercantile],
    slogan: '一笔好交易，能让敌人变成伙伴。',
    trigger_words: ['利润', '交易', '合作'],
    intel_capable: false,
  },
  ashen: {
    civilization: '游牧战士，崇尚荣誉',
    archetype: '热血战士',
    advantage: '士气上限+0.3',
    speech_style: SpeechStyle.PassionateWarrior,
    speech_style_description: speechStyleDescriptions[SpeechStyle.PassionateWarrior],
    slogan: '懦夫退后，让有勇气的人迎接战斗。',
    trigger_words: ['懦夫', '荣誉', '勇气', '战斗'],
    intel_capable: false,
  },
  voidChurch: {
    civilization: '宗教文明，精神控制',
    archetype: '神秘操控者',
    advantage: '文化影响+40%',
    speech_style: SpeechStyle.MysticalProphetic,
    speech_style_description: speechStyleDescriptions[SpeechStyle.MysticalProphetic],
    slogan: '预言已经低语，命运正在靠近。',
    trigger_words: ['命运', '预言', '信仰'],
    intel_capable: true,
  },
  aurora: {
    civilization: '科研至上，和平主义',
    archetype: '技术中立者',
    advantage: '防御加成+25%',
    speech_style: SpeechStyle.AcademicNeutral,
    speech_style_description: speechStyleDescriptions[SpeechStyle.AcademicNeutral],
    slogan: '和平不是软弱，而是最精密的研究成果。',
    trigger_words: ['研究', '和平', '知识'],
    intel_capable: false,
  },
  magma: {
    civilization: '地底文明，资源丰富',
    archetype: '防御守财奴',
    advantage: '资源产出+25%',
    speech_style: SpeechStyle.GruffPragmatic,
    speech_style_description: speechStyleDescriptions[SpeechStyle.GruffPragmatic],
    slogan: '矿脉归谁，领土就归谁。',
    trigger_words: ['资源', '矿脉', '领土'],
    intel_capable: false,
  },
  darkTide: {
    civilization: '情报网络，无处不在',
    archetype: '情报贩子',
    advantage: '情报获取免费',
    speech_style: SpeechStyle.SmoothConspiratorial,
    speech_style_description: speechStyleDescriptions[SpeechStyle.SmoothConspiratorial],
    slogan: '每个秘密都有价格，关键是你拿什么交换。',
    trigger_words: ['秘密', '情报', '交换'],
    intel_capable: true,
  },
}

export const factionMetaFixtures: FactionMeta[] = factionIds.map((id) => {
  const meta = baseFactionMeta[id]
  return {
    id,
    name: factionLabels[id],
    ...meta,
    primary: factionTokens[id].primary,
    glow: factionTokens[id].glow,
    shadow: factionTokens[id].shadow,
  }
})

export const FACTIONS = factionMetaFixtures

export const factionById = Object.fromEntries(FACTIONS.map((faction) => [faction.id, faction])) as Record<
  FactionId,
  FactionMeta
>
