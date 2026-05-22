import type { ArbitratePhase, Epoch, GameEvent, GamePhase } from '@/mock/types'

export type HudMode =
  | 'observe'
  | 'action'
  | 'resolve'
  | 'arbitrate-battle'
  | 'arbitrate-epic'
  | 'arbitrate-summary'

export type CommandTerminalMode = 'expanded' | 'collapsed' | 'hidden'
export type SidePanelMode = 'expanded' | 'compact' | 'hidden'

export type PhaseUIConfig = {
  commandTerminalVisible: boolean
  eventStreamVisible: boolean
  relationsVisible: boolean
  aiThinkingVisible: boolean
  resolveEventVisible: boolean
  epicCurtainVisible: boolean
  commandTerminalMode: CommandTerminalMode
  eventStreamMode: SidePanelMode
  relationsMode: SidePanelMode
  mapZoom: number
  hudOcclusion: number
  transitionMs: number
  borderSparkBoost: number
}

export const phaseLabels: Record<HudMode, string> = {
  observe: '态势感知',
  action: '行动',
  resolve: '博弈',
  'arbitrate-battle': '裁决·战争',
  'arbitrate-epic': '裁决·史诗',
  'arbitrate-summary': '裁决·总结',
}

export const phaseSubtitles: Record<HudMode, string> = {
  observe: '镜头巡游 / 情报吸收',
  action: '公开发言 / 密谈 / 条约 / 军令',
  resolve: 'AI 决策 / 意图收束',
  'arbitrate-battle': '结算揭晓 / 战争裁决',
  'arbitrate-epic': '史诗幕布 / 历史写入',
  'arbitrate-summary': '纪元总结 / 任务 15 接管',
}

export const phaseDurationsMs: Record<HudMode, number> = {
  observe: 15_000,
  action: 90_000,
  resolve: 30_000,
  'arbitrate-battle': 20_000,
  'arbitrate-epic': 15_000,
  'arbitrate-summary': 15_000,
}

export const phaseUIConfig: Record<HudMode, PhaseUIConfig> = {
  observe: {
    commandTerminalVisible: true,
    eventStreamVisible: true,
    relationsVisible: true,
    aiThinkingVisible: false,
    resolveEventVisible: false,
    epicCurtainVisible: false,
    commandTerminalMode: 'collapsed',
    eventStreamMode: 'compact',
    relationsMode: 'compact',
    mapZoom: 0.82,
    hudOcclusion: 8,
    transitionMs: 400,
    borderSparkBoost: 0.7,
  },
  action: {
    commandTerminalVisible: true,
    eventStreamVisible: true,
    relationsVisible: true,
    aiThinkingVisible: false,
    resolveEventVisible: false,
    epicCurtainVisible: false,
    commandTerminalMode: 'expanded',
    eventStreamMode: 'expanded',
    relationsMode: 'expanded',
    mapZoom: 1,
    hudOcclusion: 35,
    transitionMs: 400,
    borderSparkBoost: 1,
  },
  resolve: {
    commandTerminalVisible: false,
    eventStreamVisible: true,
    relationsVisible: true,
    aiThinkingVisible: true,
    resolveEventVisible: false,
    epicCurtainVisible: false,
    commandTerminalMode: 'hidden',
    eventStreamMode: 'compact',
    relationsMode: 'compact',
    mapZoom: 0.94,
    hudOcclusion: 20,
    transitionMs: 400,
    borderSparkBoost: 0.85,
  },
  'arbitrate-battle': {
    commandTerminalVisible: true,
    eventStreamVisible: true,
    relationsVisible: true,
    aiThinkingVisible: false,
    resolveEventVisible: true,
    epicCurtainVisible: false,
    commandTerminalMode: 'collapsed',
    eventStreamMode: 'expanded',
    relationsMode: 'expanded',
    mapZoom: 1.06,
    hudOcclusion: 30,
    transitionMs: 400,
    borderSparkBoost: 1.75,
  },
  'arbitrate-epic': {
    commandTerminalVisible: false,
    eventStreamVisible: false,
    relationsVisible: false,
    aiThinkingVisible: false,
    resolveEventVisible: false,
    epicCurtainVisible: true,
    commandTerminalMode: 'hidden',
    eventStreamMode: 'hidden',
    relationsMode: 'hidden',
    mapZoom: 1.16,
    hudOcclusion: 10,
    transitionMs: 400,
    borderSparkBoost: 1.2,
  },
  'arbitrate-summary': {
    commandTerminalVisible: true,
    eventStreamVisible: true,
    relationsVisible: true,
    aiThinkingVisible: false,
    resolveEventVisible: false,
    epicCurtainVisible: false,
    commandTerminalMode: 'collapsed',
    eventStreamMode: 'compact',
    relationsMode: 'compact',
    mapZoom: 0.9,
    hudOcclusion: 25,
    transitionMs: 400,
    borderSparkBoost: 1,
  },
}

export function getHudModeFromPhase(
  phase: GamePhase,
  arbitratePhase?: ArbitratePhase,
): HudMode {
  if (phase !== 'arbitrate') {
    return phase
  }

  if (arbitratePhase === 'epic') {
    return 'arbitrate-epic'
  }

  if (arbitratePhase === 'summary') {
    return 'arbitrate-summary'
  }

  return 'arbitrate-battle'
}

export function getPhaseUIConfig(hudMode: HudMode) {
  return phaseUIConfig[hudMode]
}

export function getPhaseLabel(hudMode: HudMode) {
  return phaseLabels[hudMode]
}

export function getPhaseSubtitle(hudMode: HudMode) {
  return phaseSubtitles[hudMode]
}

export function getPhaseDuration(hudMode: HudMode) {
  return phaseDurationsMs[hudMode]
}

export function getPhaseProgress(epoch: Pick<Epoch, 'phaseDurationMs'>, hudMode: HudMode) {
  const duration = getPhaseDuration(hudMode)

  if (duration <= 0) {
    return 1
  }

  return Math.min(1, Math.max(0, 1 - epoch.phaseDurationMs / duration))
}

export function isKeyResolveEvent(event: GameEvent) {
  return (
    event.priority === 'P0' ||
    event.priority === 'P1' ||
    event.kind === 'battle' ||
    event.kind === 'declare_war' ||
    event.kind === 'alliance' ||
    event.kind === 'betrayal' ||
    event.kind === 'treaty' ||
    event.kind === 'trade' ||
    event.kind === 'economy'
  )
}
