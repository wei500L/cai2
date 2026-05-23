import { tryConsumeRate } from '@/features/commandTerminal/RateLimiter'
import { militaryActionLabels, treatyKindLabels, type CommandMode } from '@/features/commandTerminal/types'
import { factionById, type FactionId } from '@/mock/factions'
import { MAX_EPOCHS, TURNS_PER_EPOCH, getPhaseDurationMs } from '@/mock/gameState'
import type {
  BattleEvent,
  Epoch,
  EventKind,
  EventPriority,
  FactionState,
  GameEvent,
  PrivateMessage,
  Relationship,
} from '@/mock/types'
import { clearAIResponseTimers, triggerAIResponses } from '@/mock/aiResponder'
import { gameStoreApi } from '@/store/gameStore'
import type { SubmitSpeechResult } from '@/features/commandTerminal/types'
import type {
  FactionStatsPatch,
  IncomingMessage,
  MapRegionPatch,
  OutgoingMessage,
  RelationshipPatch,
  StatsDiffPayload,
} from './types'

const DEFAULT_ROOM_ID = 'mock-room'
const MAX_CONTENT_LENGTH = 400

type MessageHandler = (msg: IncomingMessage) => void

export type Transport = {
  connect: () => void
  disconnect: () => void
  send: (msg: OutgoingMessage) => SubmitSpeechResult | void
  on: (handler: MessageHandler) => void
  off: (handler: MessageHandler) => void
}

let transportSequence = 0

function nextEnvelope<T extends IncomingMessage['t']>(
  type: T,
  payload: Extract<IncomingMessage, { t: T }>['p'],
): Extract<IncomingMessage, { t: T }> {
  transportSequence += 1

  return {
    v: 1,
    id: `${type}_${Date.now()}_${transportSequence}`,
    t: type,
    ts: Date.now(),
    seq: transportSequence,
    p: payload,
  } as Extract<IncomingMessage, { t: T }>
}

function createPhaseKey(epoch: Epoch) {
  return `E${epoch.id}:T${epoch.turn}:${epoch.phase}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFactionStatus(totalPower: number): FactionState['status'] {
  if (totalPower <= 0) {
    return 'eliminated'
  }

  if (totalPower >= 350) {
    return 'thriving'
  }

  if (totalPower >= 290) {
    return 'stable'
  }

  if (totalPower >= 230) {
    return 'declining'
  }

  return 'critical'
}

function recalculateFaction(faction: FactionState): FactionState {
  const totalPower =
    faction.military + faction.economy + faction.diplomacy + faction.culture + faction.morale

  return {
    ...faction,
    totalPower,
    status: getFactionStatus(totalPower),
  }
}

function nextEpochState(epoch: Epoch): Epoch | null {
  const now = Date.now()

  if (epoch.phase === 'observe') {
    return {
      ...epoch,
      phase: 'action',
      arbitratePhase: undefined,
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('action'),
    }
  }

  if (epoch.phase === 'action') {
    return {
      ...epoch,
      phase: 'resolve',
      arbitratePhase: undefined,
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('resolve'),
    }
  }

  if (epoch.phase === 'resolve') {
    if (epoch.turn < TURNS_PER_EPOCH) {
      return {
        ...epoch,
        turn: epoch.turn + 1,
        phase: 'observe',
        arbitratePhase: undefined,
        phaseStartedAt: now,
        phaseDurationMs: getPhaseDurationMs('observe'),
      }
    }

    return {
      ...epoch,
      phase: 'arbitrate',
      arbitratePhase: 'battle',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('arbitrate', 'battle'),
    }
  }

  if (epoch.arbitratePhase === 'battle') {
    return {
      ...epoch,
      arbitratePhase: 'epic',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('arbitrate', 'epic'),
    }
  }

  if (epoch.arbitratePhase === 'epic') {
    return {
      ...epoch,
      arbitratePhase: 'summary',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('arbitrate', 'summary'),
    }
  }

  if (epoch.id >= MAX_EPOCHS) {
    return null
  }

  return {
    id: epoch.id + 1,
    turn: 1,
    phase: 'observe',
    phaseStartedAt: now,
    phaseDurationMs: getPhaseDurationMs('observe'),
  }
}

function findMentionedFaction(content: string, actor: FactionId) {
  return Object.values(factionById).find(
    (faction) =>
      faction.id !== actor && (content.includes(faction.name) || content.includes(faction.id)),
  )?.id
}

function getTargetNames(targets: FactionId[]) {
  return targets.map((target) => factionById[target].name).join('、')
}

function estimateCultureGain(content: string, toneHeat: number) {
  const wordGain = Math.min(5, Math.floor(content.trim().length / 48))
  const toneGain = toneHeat < 45 ? 2 : toneHeat < 72 ? 1 : 0

  return Math.max(1, 1 + wordGain + toneGain)
}

function canDirectIntel(actor: FactionId) {
  return actor === 'darkTide' || actor === 'starlight' || actor === 'voidChurch'
}

function isDeclareWar(mode: CommandMode, content: string) {
  if (mode === 'military') {
    return content.includes('宣战')
  }

  if (mode === 'treaty') {
    return /宣战|敌对|开战|战争状态/.test(content)
  }

  return false
}

function getRelationshipPatch(
  relationship: Relationship,
  delta: number,
  reason = 'battle',
): RelationshipPatch {
  return {
    from_faction: relationship.from,
    to_faction: relationship.to,
    delta,
    reason,
  }
}

function makeEvent(
  prefix: string,
  event: Omit<GameEvent, 'id' | 'createdAt' | 'epoch' | 'turn' | 'phase'>,
): GameEvent {
  const { epoch } = gameStoreApi.getState()

  return {
    id: `${prefix}_${Date.now()}_${transportSequence + 1}`,
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    ...event,
  }
}

function getActor(message: OutgoingMessage): FactionId {
  if ('metadata' in message.p && message.p.metadata?.player_faction) {
    return message.p.metadata.player_faction
  }

  return gameStoreApi.getState().selectedFactionId ?? 'starlight'
}

function validateOutgoingAction(message: OutgoingMessage) {
  const state = gameStoreApi.getState()

  if (!message.t.startsWith('action.')) {
    return null
  }

  if (state.epoch.phase !== 'action') {
    return '等待行动期开始'
  }

  const content =
    message.t === 'action.speak'
      ? message.p.content
      : message.t === 'action.private'
        ? message.p.content
        : message.t === 'action.treaty'
          ? message.p.proposal_text
          : message.t === 'action.military'
            ? message.p.orders_text
            : message.t === 'action.intel'
              ? message.p.brief
              : ''

  if (!content.trim()) {
    return '指令内容不能为空'
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return '指令内容超过 400 字'
  }

  const rate = tryConsumeRate({
    phaseKey: createPhaseKey(state.epoch),
    playerId: getActor(message),
    mode: message.t === 'action.military' ? 'military' : message.t === 'action.intel' ? 'intel' : 'speech',
  })

  if (!rate.accepted) {
    return '本阶段发送额度已用尽'
  }

  return null
}

export class MockTransport implements Transport {
  private handlers = new Set<MessageHandler>()
  private connected = false

  connect() {
    if (this.connected) {
      return
    }

    this.connected = true
    this.emit(nextEnvelope('conn.auth.ok', {
      player_id: gameStoreApi.getState().selectedFactionId ?? 'starlight',
      display_name: 'Mock Player',
      server_time_ms: Date.now(),
    }))
  }

  disconnect() {
    this.connected = false
    clearAIResponseTimers()
    this.handlers.clear()
  }

  on(handler: MessageHandler) {
    this.handlers.add(handler)
  }

  off(handler: MessageHandler) {
    this.handlers.delete(handler)
  }

  send(message: OutgoingMessage): SubmitSpeechResult {
    if (!this.connected) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    if (message.t === 'room.ready') {
      this.advancePhase()
      return { ok: true }
    }

    const rejection = validateOutgoingAction(message)
    if (rejection) {
      this.emitRejected(message, rejection, 'ACTION_REJECTED')
      return { ok: false, error: rejection }
    }

    if (message.t === 'action.speak') {
      return this.acceptPlayerAction(message, 'speech', message.p.content, message.p.targets)
    }

    if (message.t === 'action.private') {
      return this.acceptPlayerAction(message, 'private', message.p.content, [message.p.target_faction])
    }

    if (message.t === 'action.treaty') {
      return this.acceptPlayerAction(message, 'treaty', message.p.proposal_text, message.p.target_factions)
    }

    if (message.t === 'action.military') {
      const targetOwner = gameStoreApi.getState().regions.find((region) => region.id === message.p.target_region)?.owner
      return this.acceptPlayerAction(
        message,
        'military',
        message.p.orders_text,
        targetOwner ? [targetOwner] : [],
      )
    }

    if (message.t === 'action.intel') {
      return this.acceptPlayerAction(message, 'intel', message.p.brief, [message.p.target_faction])
    }

    return { ok: true }
  }

  emitPhase(epoch: Epoch, isPaused?: boolean) {
    this.emit(nextEnvelope('phase.change', {
      room_id: DEFAULT_ROOM_ID,
      epoch: epoch.id,
      turn: epoch.turn,
      phase: epoch.phase,
      arbitrate_phase: epoch.arbitratePhase,
      phase_started_at_ms: epoch.phaseStartedAt,
      phase_duration_ms: epoch.phaseDurationMs,
      is_paused: isPaused,
    }))
  }

  emitTurnBegin(epoch: Epoch) {
    const state = gameStoreApi.getState()
    this.emit(nextEnvelope('turn.begin', {
      room_id: DEFAULT_ROOM_ID,
      epoch: epoch.id,
      turn: epoch.turn,
      visible_snapshot: {
        epoch,
        factions: state.factions,
        relationships: state.relationships,
        regions: state.regions,
      },
    }))
  }

  emitEvents(events: GameEvent[], privateMessages: PrivateMessage[] = []) {
    if (events.length === 0 && privateMessages.length === 0) {
      return
    }

    const { epoch } = gameStoreApi.getState()
    this.emit(nextEnvelope('resolve.events', {
      room_id: DEFAULT_ROOM_ID,
      epoch: epoch.id,
      turn: epoch.turn,
      events,
      private_messages: privateMessages.length > 0 ? privateMessages : undefined,
    }))
  }

  emitActionEvent(event: GameEvent, privateMessage?: PrivateMessage) {
    if (privateMessage) {
      this.emit(nextEnvelope('action.private', {
        room_id: DEFAULT_ROOM_ID,
        event,
        private_message: privateMessage,
      }))
      return
    }

    this.emit(nextEnvelope('action.broadcast', {
      room_id: DEFAULT_ROOM_ID,
      event,
    }))
  }

  emitAIEvent(event: GameEvent) {
    if (event.kind === 'ai_reaction') {
      this.emit(nextEnvelope('ai.reaction', {
        room_id: DEFAULT_ROOM_ID,
        event,
        faction_id: event.actor ?? 'starlight',
        reaction: typeof event.payload.label === 'string' ? event.payload.label : event.narration,
        target_faction: event.target,
      }))
      return
    }

    this.emit(nextEnvelope('ai.speak', {
      room_id: DEFAULT_ROOM_ID,
      event,
    }))
  }

  emitAIPrivateMessage(event: GameEvent, privateMessage: PrivateMessage) {
    this.emit(nextEnvelope('ai.speak', {
      room_id: DEFAULT_ROOM_ID,
      event,
      private_message: privateMessage,
    }))
  }

  emitMapDiff(changes: MapRegionPatch[], borderUpdates: Record<string, unknown>[] = []) {
    if (changes.length === 0 && borderUpdates.length === 0) {
      return
    }

    const { epoch } = gameStoreApi.getState()
    this.emit(nextEnvelope('resolve.map_diff', {
      room_id: DEFAULT_ROOM_ID,
      epoch: epoch.id,
      turn: epoch.turn,
      changes,
      border_updates: borderUpdates,
    }))
  }

  emitStatsDiff(diff: Omit<StatsDiffPayload, 'room_id' | 'epoch' | 'turn'>) {
    if (diff.faction_stats.length === 0 && diff.relationship_changes.length === 0) {
      return
    }

    const { epoch } = gameStoreApi.getState()
    this.emit(nextEnvelope('resolve.stats_diff', {
      room_id: DEFAULT_ROOM_ID,
      epoch: epoch.id,
      turn: epoch.turn,
      faction_stats: diff.faction_stats,
      relationship_changes: diff.relationship_changes,
    }))
  }

  tickPhase(deltaMs: number) {
    if (deltaMs <= 0) {
      return
    }

    const state = gameStoreApi.getState()
    if (state.isPaused) {
      return
    }

    this.emitPhase({
      ...state.epoch,
      phaseDurationMs: Math.max(0, state.epoch.phaseDurationMs - deltaMs),
    })
  }

  advancePhase() {
    const previous = gameStoreApi.getState().epoch
    const next = nextEpochState(previous)

    if (!next) {
      this.emitPhase(previous, true)
      return null
    }

    this.emitPhase(next)

    if (next.phase === 'observe') {
      this.emitTurnBegin(next)
    }

    return next
  }

  resolveBattle(attackerId: FactionId, defenderId: FactionId, regionId: string) {
    const state = gameStoreApi.getState()
    const attacker = state.factions.find((faction) => faction.id === attackerId)
    const defender = state.factions.find((faction) => faction.id === defenderId)
    const region = state.regions.find((item) => item.id === regionId)

    if (!attacker || !defender || !region) {
      return
    }

    const terrainBonus = region.terrain === 'fortress' || region.terrain === 'mountain' ? 18 : 8
    const attackerPower = Math.round(attacker.military * 1.2 + attacker.morale * 0.55)
    const defenderPower = Math.round(
      defender.military * 1.05 + defender.morale * 0.65 + terrainBonus + region.developmentLevel * 3,
    )
    const winner = attackerPower >= defenderPower ? attackerId : defenderId
    const loser = winner === attackerId ? defenderId : attackerId
    const regionOwnerChanged = winner === attackerId && region.owner !== attackerId
    const attackerCasualties = Math.round(defenderPower * 0.18)
    const defenderCasualties = Math.round(attackerPower * 0.2)
    const attackerNext = recalculateFaction({
      ...attacker,
      military: clamp(attacker.military - attackerCasualties, 0, 100),
      morale: clamp(attacker.morale + (winner === attackerId ? 4 : -6), 0, 100),
    })
    const defenderNext = recalculateFaction({
      ...defender,
      military: clamp(defender.military - defenderCasualties, 0, 100),
      morale: clamp(defender.morale + (winner === defenderId ? 3 : -7), 0, 100),
    })
    const attackerPatch: FactionStatsPatch = {
      faction_id: attackerId,
      military_delta: attackerNext.military - attacker.military,
      economy_delta: attackerNext.economy - attacker.economy,
      diplomacy_delta: attackerNext.diplomacy - attacker.diplomacy,
      culture_delta: attackerNext.culture - attacker.culture,
      morale_delta: attackerNext.morale - attacker.morale,
      resulting_military: attackerNext.military,
      resulting_economy: attackerNext.economy,
      resulting_diplomacy: attackerNext.diplomacy,
      resulting_culture: attackerNext.culture,
      resulting_morale: attackerNext.morale,
      resulting_total_power: attackerNext.totalPower,
      crisis: attackerNext.status === 'critical',
      reason: 'battle',
    }
    const defenderPatch: FactionStatsPatch = {
      faction_id: defenderId,
      military_delta: defenderNext.military - defender.military,
      economy_delta: defenderNext.economy - defender.economy,
      diplomacy_delta: defenderNext.diplomacy - defender.diplomacy,
      culture_delta: defenderNext.culture - defender.culture,
      morale_delta: defenderNext.morale - defender.morale,
      resulting_military: defenderNext.military,
      resulting_economy: defenderNext.economy,
      resulting_diplomacy: defenderNext.diplomacy,
      resulting_culture: defenderNext.culture,
      resulting_morale: defenderNext.morale,
      resulting_total_power: defenderNext.totalPower,
      crisis: defenderNext.status === 'critical',
      reason: 'battle',
    }
    const relationshipChanges = state.relationships
      .filter(
        (relationship) =>
          (relationship.from === attackerId && relationship.to === defenderId) ||
          (relationship.from === defenderId && relationship.to === attackerId),
      )
      .map((relationship) => getRelationshipPatch(relationship, -18, 'battle'))

    this.emitStatsDiff({
      faction_stats: [attackerPatch, defenderPatch],
      relationship_changes: relationshipChanges,
    })

    if (regionOwnerChanged) {
      this.emitMapDiff([{ id: regionId, owner: attackerId }])
    }

    const event: BattleEvent = {
      id: `battle_${Date.now()}_${transportSequence + 1}`,
      createdAt: Date.now(),
      epoch: state.epoch.id,
      turn: state.epoch.turn,
      phase: state.epoch.phase,
      priority: 'P0',
      kind: 'battle',
      actor: attackerId,
      target: defenderId,
      payload: {
        regionId,
        attacker: attackerId,
        defender: defenderId,
        attackerPower,
        defenderPower,
        winner,
        loser,
        casualties: {
          attacker: attackerCasualties,
          defender: defenderCasualties,
        },
        atk_loss: attackerCasualties,
        def_loss: defenderCasualties,
        territory_captured: regionOwnerChanged,
        morale_shift: {
          attacker: winner === attackerId ? 4 : -6,
          defender: winner === defenderId ? 3 : -7,
        },
        regionOwnerChanged,
        stateApplied: true,
      },
      narration: `${factionById[attackerId].name}与${factionById[defenderId].name}在${regionId}爆发战斗，${factionById[winner].name}取得优势`,
    }

    this.emitEvents([event])
  }

  private acceptPlayerAction(
    message: OutgoingMessage,
    mode: CommandMode,
    content: string,
    rawTargets: FactionId[],
  ): SubmitSpeechResult {
    const actor = getActor(message)
    const tone = 'metadata' in message.p ? message.p.metadata?.tone : undefined
    const toneHeat = tone?.heat ?? 0
    let targets = rawTargets.filter((target) => target !== actor)
    const declareWar = isDeclareWar(mode, content)

    if (declareWar && targets.length === 0) {
      const mentionedTarget = findMentionedFaction(content, actor)
      targets = mentionedTarget ? [mentionedTarget] : []
    }

    const target = targets[0]
    const priority: EventPriority = declareWar ? 'P0' : tone?.isAggressive ? 'P1' : 'P2'
    const treatyKind = message.t === 'action.treaty' ? message.p.treaty_kind : undefined
    const kind: EventKind =
      declareWar
        ? 'declare_war'
        : mode === 'treaty'
          ? (treatyKind ?? 'non_aggression')
          : mode === 'military'
            ? 'battle'
            : mode
    const targetNames = getTargetNames(targets)
    const treatyLabel = treatyKind ? treatyKindLabels[treatyKind] : undefined
    const militaryLabel = message.t === 'action.military' ? militaryActionLabels[message.p.movement] : undefined
    const narrationByMode: Record<CommandMode, string> = {
      speech: `${factionById[actor].name}发表公开演讲，预计文化影响 +${estimateCultureGain(content, toneHeat)}`,
      private: `${factionById[actor].name}向${targetNames}发送加密密谈`,
      treaty: `${factionById[actor].name}向${targetNames}提出${treatyLabel ?? '条约'}草案`,
      military: `${factionById[actor].name}下达${militaryLabel ?? '战术'}军令`,
      intel: `${factionById[actor].name}请求针对${targetNames}的情报`,
    }
    const event = makeEvent(mode, {
      priority,
      kind,
      actor,
      target,
      payload: {
        origin: 'player_command',
        mode,
        text: content,
        targets,
        treatyKind,
        military:
          message.t === 'action.military'
            ? {
                unitId: message.p.unit_id,
                sourceRegionId: message.p.source_region,
                targetRegionId: message.p.target_region,
                action: message.p.movement,
              }
            : undefined,
        tone,
        culture_gain: mode === 'speech' ? estimateCultureGain(content, toneHeat) : undefined,
        viaCourier: mode === 'intel' && !canDirectIntel(actor),
      },
      narration: narrationByMode[mode],
    })
    const privateMessage =
      mode === 'private' && target
        ? {
            id: `private_message_${Date.now()}_${transportSequence + 1}`,
            createdAt: Date.now(),
            epoch: event.epoch,
            turn: event.turn,
            phase: event.phase,
            from: actor,
            to: target,
            priority,
            subject: `密谈：${factionById[target].name}`,
            body: content,
            encrypted: true,
            payload: {
              sourceEventId: event.id,
              tone,
            },
          }
        : undefined

    this.emitActionEvent(event, privateMessage)

    if (toneHeat >= 72) {
      this.emitActionEvent(makeEvent('betrayal', {
        priority: 'P1',
        kind: 'betrayal',
        actor,
        target,
        payload: {
          sourceEventId: event.id,
          provisional: true,
          toneHeat,
        },
        narration: `${factionById[actor].name}的强硬措辞被记录为潜在背叛倾向`,
      }))
    }

    triggerAIResponses(event, this)

    return { ok: true, eventId: event.id }
  }

  private emitRejected(message: OutgoingMessage, reason: string, errorCode: string) {
    this.emit(nextEnvelope('action.rejected', {
      room_id: 'room_id' in message.p ? message.p.room_id : DEFAULT_ROOM_ID,
      request_id: message.id,
      reason,
      error_code: errorCode,
    }))
  }

  private emit(message: IncomingMessage) {
    if (!this.connected) {
      return
    }

    for (const handler of this.handlers) {
      handler(message)
    }
  }
}

export declare class WebSocketTransport implements Transport {
  constructor(url: string, token: string)
  connect(): void
  disconnect(): void
  send(msg: OutgoingMessage): SubmitSpeechResult | void
  on(handler: MessageHandler): void
  off(handler: MessageHandler): void
}

// TODO: 替换为 WebSocketTransport，URL 与 token 待后端接入
