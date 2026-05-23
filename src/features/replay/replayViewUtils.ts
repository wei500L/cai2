import { factionMetaStore } from '@/store/factionMetaStore'
import type { FactionId } from '@/types/faction'
import type { GameEvent, GamePhase, RelationshipStatus } from '@/types'

export const phaseLabels: Record<GamePhase, string> = {
  observe: '观察',
  action: '行动',
  resolve: '结算',
  arbitrate: '仲裁',
}

export const relationshipLabels: Record<RelationshipStatus, string> = {
  hostile: '敌对',
  wary: '戒备',
  neutral: '中立',
  friendly: '友好',
  allied: '同盟',
}

export const relationshipColors: Record<RelationshipStatus, string> = {
  hostile: 'rgba(255,102,102,0.82)',
  wary: 'rgba(255,153,51,0.62)',
  neutral: 'rgba(196,228,255,0.18)',
  friendly: 'rgba(255,204,102,0.56)',
  allied: 'rgba(51,255,255,0.72)',
}

export function formatReplayTime(epoch: number, turn: number, phase?: GamePhase) {
  return `E${epoch} / T${turn}${phase ? ` / ${phaseLabels[phase]}` : ''}`
}

export function createEventLookup(events: GameEvent[]) {
  return new Map(events.map((event) => [event.id, event]))
}

export function getEventFaction(event?: GameEvent): FactionId {
  return event?.actor ?? event?.target ?? 'starlight'
}

export function getFactionName(factionId?: FactionId) {
  return factionId ? factionMetaStore.getState().byId[factionId]?.name ?? factionId : '未知势力'
}

export function getMarkerLabel(event?: GameEvent) {
  if (!event) {
    return '▲节点'
  }

  const category = getReplayEventCategory(event)
  if (category === 'declare_war') {
    return '▲宣战'
  }
  if (category === 'elimination') {
    return '▲灭国'
  }
  if (category === 'betrayal') {
    return '▲背叛'
  }
  if (category === 'alliance') {
    return '▲结盟'
  }

  return event.priority === 'P0' ? '▲战役' : '▲转折'
}

export function getReplayEventCategory(event: GameEvent): 'declare_war' | 'elimination' | 'betrayal' | 'alliance' | null {
  if (event.kind === 'declare_war' || event.narration.includes('宣战')) {
    return 'declare_war'
  }

  if (
    event.payload.eliminatedFaction ||
    event.payload.elimination ||
    /灭国|灭亡|旗帜熄灭|消失/.test(event.narration)
  ) {
    return 'elimination'
  }

  if (event.kind === 'betrayal' || /背叛|违约|撕毁/.test(event.narration)) {
    return 'betrayal'
  }

  if (event.kind === 'alliance' || /结盟|同盟|盟约/.test(event.narration)) {
    return 'alliance'
  }

  return null
}
