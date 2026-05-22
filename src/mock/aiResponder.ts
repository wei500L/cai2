import { factionIds } from '@/components/hudTheme'
import { factionById, type FactionId } from '@/mock/factions'
import {
  AI_PRIVATE_TEMPLATES,
  AI_REACTION_TEMPLATES,
  AI_SPEECH_TEMPLATES,
  SYSTEM_NARRATION_TEMPLATES,
  type AITemplateParams,
} from '@/mock/aiTemplates'
import type { EventKind, EventPriority, GameEvent, GamePhase, PrivateMessage } from '@/mock/types'
import { gameStoreApi } from '@/store/gameStore'
import { pickOne, randomInt } from '@/utils/random'

const ALLOWED_RESPONSE_PHASES = new Set<GamePhase>(['observe', 'action', 'resolve'])
const resources = ['矿脉', '港口', '粮道', '科研样本', '关税', '边境通道']
const secrets = ['边境名单', '密约副本', '贸易账本', '失踪信使', '军需路线', '匿名证词']
const omens = ['黑星偏移', '裂隙回声', '无月之夜', '沉默钟声', '灰色烛火', '潮汐倒转']

let aiEventSequence = 0
const activeTimers = new Set<ReturnType<typeof setTimeout>>()

function createAIEventId(prefix: string) {
  aiEventSequence += 1
  return `ai_${prefix}_${Date.now()}_${aiEventSequence}`
}

function rng() {
  return Math.random
}

function buildParams(actor: FactionId, target?: FactionId): AITemplateParams {
  const state = gameStoreApi.getState()
  const playerId = state.selectedFactionId ?? 'starlight'
  const random = rng()

  return {
    actorName: factionById[actor].name,
    targetName: target ? factionById[target].name : factionById[playerId].name,
    playerName: factionById[playerId].name,
    percent: randomInt(random, 31, 68),
    resource: pickOne(random, resources),
    secret: pickOne(random, secrets),
    omen: pickOne(random, omens),
  }
}

function fillTemplate(template: string, params: Record<string, string | number | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

function renderFactionTemplate(
  table: Record<FactionId, string[]>,
  actor: FactionId,
  target?: FactionId,
) {
  const random = rng()
  return fillTemplate(pickOne(random, table[actor]), buildParams(actor, target))
}

function renderSystemTemplate(kind: string, params: Record<string, string | number | undefined>) {
  const random = rng()
  const templates = SYSTEM_NARRATION_TEMPLATES[kind] ?? SYSTEM_NARRATION_TEMPLATES.phase_change
  return fillTemplate(pickOne(random, templates), params)
}

function schedule(delayMs: number, task: () => void) {
  const timer = setTimeout(() => {
    activeTimers.delete(timer)
    task()
  }, delayMs)

  activeTimers.add(timer)
}

function pushAIEvent(
  kind: EventKind,
  actor: FactionId | undefined,
  target: FactionId | undefined,
  priority: EventPriority,
  text: string,
  payload: Record<string, unknown>,
) {
  const { epoch, pushEvent } = gameStoreApi.getState()

  pushEvent({
    id: createAIEventId(kind),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority,
    kind,
    actor,
    target,
    payload,
    narration: text,
  })
}

function addAIPrivateMessage(from: FactionId, to: FactionId, body: string, responseMode = 'reply') {
  const { epoch, addPrivateMessage, pushEvent } = gameStoreApi.getState()
  const message: PrivateMessage = {
    id: createAIEventId('private_message'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    from,
    to,
    priority: responseMode === 'pretend' ? 'P1' : 'P2',
    subject: `密谈回复：${factionById[from].name}`,
    body,
    encrypted: true,
    payload: {
      aiGenerated: true,
      responseMode,
    },
  }

  addPrivateMessage(message)
  pushEvent({
    id: createAIEventId('private'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority: message.priority,
    kind: 'private',
    actor: from,
    target: to,
    payload: {
      aiGenerated: true,
      messageId: message.id,
      responseMode,
    },
    narration: `${factionById[from].name}发来加密密谈回复`,
  })
}

function getPlayerFaction() {
  return gameStoreApi.getState().selectedFactionId ?? 'starlight'
}

function getAIFactions(playerId: FactionId) {
  return factionIds.filter((id) => id !== playerId)
}

function isResponsePhase() {
  return ALLOWED_RESPONSE_PHASES.has(gameStoreApi.getState().epoch.phase)
}

function pushReaction(actor: FactionId, target: FactionId, sourceEventId: string) {
  if (!isResponsePhase()) {
    return
  }

  const label = renderFactionTemplate(AI_REACTION_TEMPLATES, actor, target)
  pushAIEvent('reaction', actor, target, 'P2', label, {
    aiGenerated: true,
    sourceEventId,
    label,
  })
}

function pushPublicSpeech(actor: FactionId, target: FactionId, sourceEventId: string) {
  if (!isResponsePhase()) {
    return
  }

  const text = renderFactionTemplate(AI_SPEECH_TEMPLATES, actor, target)
  pushAIEvent('speech', actor, target, 'P2', text, {
    aiGenerated: true,
    sourceEventId,
    channel: 'public',
    stance: 'pragmatic',
    text,
  })
}

function pushDeclareWarNarration(playerEvent: GameEvent) {
  const playerId = getPlayerFaction()
  const target = playerEvent.target ?? getAIFactions(playerId)[0]
  const text = renderSystemTemplate('declare_war', {
    actorName: factionById[playerId].name,
    targetName: factionById[target].name,
  })

  pushAIEvent('narration', undefined, target, 'P0', text, {
    aiGenerated: true,
    sourceEventId: playerEvent.id,
    narrationKind: 'declare_war',
  })
}

function pushBetrayalEvent(actor: FactionId, target: FactionId, sourceEventId: string) {
  const text = renderSystemTemplate('betrayal', {
    actorName: factionById[actor].name,
    targetName: factionById[target].name,
  })

  pushAIEvent('betrayal', actor, target, 'P1', text, {
    aiGenerated: true,
    sourceEventId,
    provisional: true,
    responseMode: 'pretend',
  })
}

function triggerSpeechResponses(playerEvent: GameEvent) {
  const playerId = getPlayerFaction()
  const random = rng()

  for (const factionId of getAIFactions(playerId)) {
    if (random() < 0.5) {
      pushReaction(factionId, playerId, playerEvent.id)
    }
  }

  const responder = pickOne(random, getAIFactions(playerId))
  schedule(randomInt(random, 1_000, 3_000), () => {
    pushPublicSpeech(responder, playerId, playerEvent.id)
  })
}

function triggerPrivateResponses(playerEvent: GameEvent) {
  const playerId = getPlayerFaction()
  const target = playerEvent.target

  if (!target || target === playerId) {
    return
  }

  const random = rng()
  const roll = random()

  if (roll < 0.7) {
    schedule(randomInt(random, 1_500, 3_000), () => {
      addAIPrivateMessage(
        target,
        playerId,
        renderFactionTemplate(AI_PRIVATE_TEMPLATES, target, playerId),
      )
    })
    return
  }

  if (roll < 0.9) {
    return
  }

  schedule(randomInt(random, 1_500, 3_000), () => {
    addAIPrivateMessage(
      target,
      playerId,
      renderFactionTemplate(AI_PRIVATE_TEMPLATES, target, playerId),
      'pretend',
    )
  })
  schedule(randomInt(random, 5_000, 10_000), () => {
    pushBetrayalEvent(target, playerId, playerEvent.id)
  })
}

function triggerDeclareWarResponses(playerEvent: GameEvent) {
  const playerId = getPlayerFaction()
  const targets = playerEvent.target ? [playerEvent.target] : getAIFactions(playerId)

  for (const target of targets) {
    pushReaction(target, playerId, playerEvent.id)
  }

  schedule(2_000, () => {
    pushDeclareWarNarration(playerEvent)
  })
}

export function isPlayerCommandEvent(event: GameEvent) {
  const playerId = getPlayerFaction()
  return event.actor === playerId && event.payload.origin === 'player_command'
}

export function triggerAIResponses(playerEvent: GameEvent) {
  if (!isPlayerCommandEvent(playerEvent)) {
    return
  }

  if (gameStoreApi.getState().epoch.phase === 'arbitrate') {
    return
  }

  if (playerEvent.kind === 'declare_war') {
    triggerDeclareWarResponses(playerEvent)
    return
  }

  if (playerEvent.kind === 'speech') {
    triggerSpeechResponses(playerEvent)
    return
  }

  if (playerEvent.kind === 'private') {
    triggerPrivateResponses(playerEvent)
  }
}

export function clearAIResponseTimers() {
  for (const timer of activeTimers) {
    clearTimeout(timer)
  }

  activeTimers.clear()
}
