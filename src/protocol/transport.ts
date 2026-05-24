import { tryConsumeRate } from '@/features/commandTerminal/RateLimiter'
import { militaryActionLabels, treatyKindLabels, type CommandMode } from '@/features/commandTerminal/types'
import { factionMetaFixtures } from '@/mock/factions'
import { SYSTEM_NARRATION_TEMPLATES } from '@/mock/aiTemplates'
import type { FactionId, FactionMeta } from '@/types/faction'
import type {
  BattleEvent,
  Epoch,
  EventKind,
  EventPriority,
  FactionState,
  GameEvent,
  MapRegion,
  PrivateMessage,
  Relationship,
  EpicNarrationPayload,
  SummaryNarrationPayload,
} from '@/types'
import { clearAIResponseTimers, triggerAIResponses } from '@/mock/aiResponder'
import { createMockWorldGeometry } from '@/mock/worldGeometry'
import { createMockDiplomaticVisuals } from '@/mock/diplomaticArcs'
import { gameStoreApi } from '@/store/gameStore'
import { createInitialState } from '@/store/gameStoreSeed'
import { useUIStore } from '@/store/uiStore'
import type { SubmitSpeechResult } from '@/features/commandTerminal/types'
import type {
  FactionStatsPatch,
  IncomingMessage,
  BorderTensionEntry,
  OutgoingMessage,
  RelationshipPatch,
  RegionChange,
  ScorchedDiffPayload,
  ReconnectEpochTurn,
  RoomPlayerSnapshot,
  RoomSnapshotPayload,
  RoomStartedPayload,
  StatsDiffPayload,
} from './types'

const DEFAULT_ROOM_ID = 'mock-room'
const MAX_CONTENT_LENGTH = 400
const mockFactionById = Object.fromEntries(factionMetaFixtures.map((faction) => [faction.id, faction])) as Record<
  FactionId,
  FactionMeta
>

type MessageHandler = (msg: IncomingMessage) => void

export type TransportStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

export type ReconnectConfig = {
  enabled: boolean
  baseDelayMs: number
  maxDelayMs: number
  maxAttempts: number
}

export type TransportConfig = {
  kind: 'mock' | 'ws'
  ws?: {
    url: string
    token?: string
    clientVersion: string
    playerId?: string
    reconnect?: Partial<ReconnectConfig>
    heartbeatIntervalMs?: number
    onStatusChange?: (status: TransportStatus) => void
  }
  mock?: {
    latencyMs?: number
    startGameLoop?: boolean
    lobbyMode?: boolean
  }
}

export type Transport = {
  connect: () => void
  disconnect: () => void
  send: (msg: OutgoingMessage) => SubmitSpeechResult | void
  on: (handler: MessageHandler) => void
  off: (handler: MessageHandler) => void
  requestReconnect?: () => void
  setReconnectContext?: (context: ReconnectContext) => void
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

function getRoomId() {
  const currentRoomId = gameStoreApi.getState().currentRoomId
  if (currentRoomId) {
    return currentRoomId
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('diplomacy_current_room_id')
      if (stored) {
        return stored
      }
    } catch {
      // ignore
    }
  }

  return DEFAULT_ROOM_ID
}

function createPhaseKey(epoch: Epoch) {
  return `E${epoch.id}:T${epoch.turn}:${epoch.phase}`
}

function toReconnectEpochTurn(epoch: Epoch): ReconnectEpochTurn {
  return {
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    arbitrate_phase: epoch.arbitratePhase ?? null,
    phase_started_at_ms: epoch.phaseStartedAt,
    phase_duration_ms: epoch.phaseDurationMs,
  }
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

function nextEpochState(epoch: Epoch, settings = gameStoreApi.getState().settings): Epoch | null {
  const now = Date.now()
  const phaseDurations = settings.phase_durations
  const getPhaseDuration = (phase: Epoch['phase']) => phaseDurations[phase] ?? 0

  if (epoch.phase === 'observe') {
    return {
      ...epoch,
      phase: 'action',
      arbitratePhase: undefined,
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDuration('action'),
    }
  }

  if (epoch.phase === 'action') {
    return {
      ...epoch,
      phase: 'resolve',
      arbitratePhase: undefined,
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDuration('resolve'),
    }
  }

  if (epoch.phase === 'resolve') {
    if (epoch.turn < settings.turns_per_epoch) {
      return {
        ...epoch,
        turn: epoch.turn + 1,
        phase: 'observe',
        arbitratePhase: undefined,
        phaseStartedAt: now,
        phaseDurationMs: getPhaseDuration('observe'),
      }
    }

    return {
      ...epoch,
      phase: 'arbitrate',
      arbitratePhase: 'battle',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDuration('arbitrate'),
    }
  }

  if (epoch.arbitratePhase === 'battle') {
    return {
      ...epoch,
      arbitratePhase: 'epic',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDuration('arbitrate'),
    }
  }

  if (epoch.arbitratePhase === 'epic') {
    return {
      ...epoch,
      arbitratePhase: 'summary',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDuration('arbitrate'),
    }
  }

  if (settings.max_epochs > 0 && epoch.id >= settings.max_epochs) {
    return null
  }

  return {
    id: epoch.id + 1,
    turn: 1,
    phase: 'observe',
    phaseStartedAt: now,
    phaseDurationMs: getPhaseDuration('observe'),
  }
}

function replaceTemplate(template: string, params: Record<string, string | number | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

function getFactionName(id: FactionId | null | undefined) {
  return id ? mockFactionById[id]?.name ?? id : '无名势力'
}

function numberFromPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function moraleDeltaFor(event: GameEvent, id: FactionId) {
  const shift = event.payload.morale_shift

  if (typeof shift === 'number') {
    return event.actor === id ? shift : event.target === id ? -shift : 0
  }

  if (!shift || typeof shift !== 'object') {
    return 0
  }

  const attacker = 'attacker' in shift && typeof shift.attacker === 'number' ? shift.attacker : 0
  const defender = 'defender' in shift && typeof shift.defender === 'number' ? shift.defender : 0

  if (event.actor === id) {
    return attacker
  }

  if (event.target === id) {
    return defender
  }

  return 0
}

function estimatePreviousPower(faction: FactionState, events: GameEvent[]) {
  let previousPower = faction.totalPower

  for (const event of events) {
    if (event.kind === 'battle') {
      if (event.actor === faction.id) {
        previousPower += numberFromPayload(event.payload, 'atk_loss')
      }

      if (event.target === faction.id) {
        previousPower += numberFromPayload(event.payload, 'def_loss')
      }

      previousPower -= moraleDeltaFor(event, faction.id)
    }

    if (event.kind === 'speech' && event.actor === faction.id) {
      previousPower -= numberFromPayload(event.payload, 'culture_gain')
    }
  }

  return Math.max(0, Math.round(previousPower))
}

function rankByPower(items: Array<{ id: FactionId; totalPower: number }>) {
  return new Map(
    [...items]
      .sort((a, b) => b.totalPower - a.totalPower)
      .map((item, index) => [item.id, index + 1]),
  )
}

function getTemplateIndex(epochId: number, eventCount: number, warCount: number, betrayalCount: number) {
  return Math.abs(epochId * 17 + eventCount * 7 + warCount * 5 + betrayalCount * 3)
}

function buildEpicNarrationPayload(epoch: Epoch): EpicNarrationPayload {
  const state = gameStoreApi.getState()
  const epochEvents = state.events.filter((event) => event.epoch === epoch.id)
  const warCount = epochEvents.filter((event) => event.kind === 'battle').length
  const betrayalCount = epochEvents.filter((event) => event.kind === 'betrayal').length
  const weakest = [...state.factions].sort((a, b) => a.totalPower - b.totalPower)[0]
  const strongest = [...state.factions].sort((a, b) => b.totalPower - a.totalPower)[0]
  const templates = SYSTEM_NARRATION_TEMPLATES.epoch_summary
  const template = templates[getTemplateIndex(epoch.id, epochEvents.length, warCount, betrayalCount) % templates.length]
  const majorEvent = epochEvents.find((event) => event.priority === 'P0' || event.priority === 'P1')

  return {
    epoch: epoch.id,
    source: 'template_fallback',
    narrative: replaceTemplate(template, {
      epoch: epoch.id,
      epochRoman: ['','I','II','III','IV','V','VI','VII','VIII','IX','X'][epoch.id] ?? String(epoch.id),
      fallenName: getFactionName(weakest?.id),
      topFactionName: getFactionName(strongest?.id),
      warCount,
      betrayalCount,
      majorEvent: majorEvent?.narration ?? '沉默的边境仍在等待下一次裁决',
    }),
    model: 'mock-llm',
    generatedAtMs: Date.now(),
  }
}

function buildSummaryNarrationPayload(epoch: Epoch): SummaryNarrationPayload {
  const state = gameStoreApi.getState()
  const epochEvents = [...state.events].filter((event) => event.epoch === epoch.id)
  const sortedEpochEvents = [...epochEvents].sort(
    (left, right) => left.createdAt - right.createdAt || left.turn - right.turn || left.id.localeCompare(right.id),
  )
  const currentRanks = rankByPower(state.factions)
  const previousPowers = state.factions.map((faction) => ({
    id: faction.id,
    totalPower: estimatePreviousPower(faction, epochEvents),
  }))
  const previousRanks = rankByPower(previousPowers)

  return {
    epoch: epoch.id,
    source: 'template_fallback',
    highlights: {
      majorEvents: sortedEpochEvents
        .filter((event) => event.priority === 'P0' || event.priority === 'P1')
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          kind: event.kind,
          turn: event.turn,
          priority: event.priority,
          actor: event.actor ?? null,
          target: event.target ?? null,
          narration: event.narration,
        })),
      wars: sortedEpochEvents
        .filter((event) => event.kind === 'battle' && event.actor && event.target)
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          kind: 'battle' as const,
          turn: event.turn,
          priority: event.priority,
          actor: event.actor as FactionId,
          target: event.target as FactionId,
          regionId: String(event.payload.region_id ?? ''),
          attackerLoss: numberFromPayload(event.payload, 'atk_loss'),
          defenderLoss: numberFromPayload(event.payload, 'def_loss'),
          attackerRemainingTroops: numberFromPayload(event.payload, 'attacker_remaining_troops'),
          defenderRemainingTroops: numberFromPayload(event.payload, 'defender_remaining_troops'),
          narration: event.narration,
        })),
      betrayals: sortedEpochEvents
        .filter((event) => event.kind === 'betrayal' && event.actor && event.target)
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          kind: 'betrayal' as const,
          turn: event.turn,
          priority: event.priority,
          actor: event.actor as FactionId,
          target: event.target as FactionId,
          narration: event.narration,
        })),
    },
    rankings: state.factions
      .map((faction) => {
        const previousPower = previousPowers.find((item) => item.id === faction.id)?.totalPower ?? faction.totalPower
        const previousRank = previousRanks.get(faction.id) ?? state.factions.length
        const currentRank = currentRanks.get(faction.id) ?? state.factions.length

        return {
          id: faction.id,
          name: mockFactionById[faction.id]?.name ?? faction.id,
          totalPower: faction.totalPower,
          previousRank,
          currentRank,
          rankDelta: previousRank - currentRank,
          previousPower,
        }
      })
      .sort((a, b) => a.currentRank - b.currentRank),
    generatedAtMs: Date.now(),
  }
}

function findMentionedFaction(content: string, actor: FactionId) {
  return Object.values(mockFactionById).find(
    (faction) =>
      faction.id !== actor && (content.includes(faction.name) || content.includes(faction.id)),
  )?.id
}

function getTargetNames(targets: FactionId[]) {
  return targets.map((target) => mockFactionById[target].name).join('、')
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

function regionKey(region: MapRegion) {
  return region.hex_id ?? region.id
}

function collectNeighborHexIds(
  startRegion: MapRegion,
  regions: MapRegion[],
  maxTotal: number,
  hopDepth: number,
) {
  const lookup = new Map(regions.map((region) => [region.id, region]))
  const seen = new Set<string>()
  const queue: Array<{ region: MapRegion; depth: number }> = [{ region: startRegion, depth: 0 }]

  while (queue.length > 0 && seen.size < maxTotal) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    const key = regionKey(current.region)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    if (current.depth >= hopDepth) {
      continue
    }

    const neighbors = [...current.region.neighbors].sort()
    for (const neighborId of neighbors) {
      const neighbor = lookup.get(neighborId)
      if (!neighbor) {
        continue
      }

      queue.push({ region: neighbor, depth: current.depth + 1 })
    }
  }

  return [...seen].slice(0, maxTotal)
}

function buildScorchedPlan(kind: string) {
  if (kind === 'nuke') {
    return { ttlTurns: 5, fallout: 0.6, severity: 0.9, maxTotal: 8, hopDepth: 2, scorch: true }
  }

  if (kind === 'aerial') {
    return { ttlTurns: 1, fallout: 0, severity: 0.54, maxTotal: 3, hopDepth: 1, scorch: true }
  }

  if (kind === 'naval') {
    return { ttlTurns: 0, fallout: 0, severity: 0.22, maxTotal: 5, hopDepth: 1, scorch: false }
  }

  if (kind === 'siege') {
    return { ttlTurns: 3, fallout: 0.12, severity: 0.68, maxTotal: 6, hopDepth: 1, scorch: true }
  }

  if (kind === 'uprising') {
    return { ttlTurns: 2, fallout: 0.04, severity: 0.58, maxTotal: 4, hopDepth: 1, scorch: true }
  }

  return { ttlTurns: 2, fallout: 0, severity: 0.66, maxTotal: 4, hopDepth: 1, scorch: true }
}

function buildScorchedDiffPayload(
  region: MapRegion,
  kind: string,
  turn: number,
): ScorchedDiffPayload {
  const plan = buildScorchedPlan(kind)
  const affectedHexIds = collectNeighborHexIds(region, gameStoreApi.getState().regions, plan.maxTotal, plan.hopDepth)

  return {
    room_id: getRoomId(),
    epoch: gameStoreApi.getState().epoch.id,
    turn,
    changes: plan.scorch
      ? affectedHexIds.map((hexId, index) => ({
          hex_id: hexId,
          scorched_turns_remaining: plan.ttlTurns,
          fallout: hexId === regionKey(region) ? plan.fallout : clamp(plan.fallout * 0.5, 0, 1),
          scorched_since_turn: turn,
          severity: hexId === regionKey(region) ? plan.severity : clamp(plan.severity - index * 0.04, 0.4, 1),
        }))
      : [],
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
  private latencyMs = 0
  private startMockLoopOnConnect = false
  private lobbyMode = false
  private stopMockLoop: (() => void) | null = null

  constructor(config: { latencyMs?: number; startGameLoop?: boolean; lobbyMode?: boolean } = {}) {
    this.latencyMs = Math.max(0, config.latencyMs ?? 0)
    this.startMockLoopOnConnect = Boolean(config.startGameLoop)
    this.lobbyMode = Boolean(config.lobbyMode)
  }

  connect() {
    if (this.connected) {
      return
    }

    this.connected = true
    const fixtureSeed = 2_026_052_2
    const developmentState = createInitialState(fixtureSeed)
    const roomId = getRoomId()
    const humanFactions = factionMetaFixtures.slice(0, 4)
    const aiFactions = factionMetaFixtures.slice(4).map((faction) => faction.id)
    const players = humanFactions.map((faction, index) => ({
      player_id: `mock-player-${index}`,
      display_name: `Mock Player ${index + 1}`,
      faction_id: faction.id,
      connected: true,
      ready: true,
      ai_takeover: false,
    }))
    const roomSnapshot: RoomSnapshotPayload = {
      room_id: roomId,
      mode: 'multi_4v4',
      status: 'running',
      players,
      ai_factions: aiFactions,
      settings: developmentState.settings,
      current_turn: toReconnectEpochTurn(developmentState.epoch),
      factions: developmentState.factions,
      regions: developmentState.regions,
      relationships: developmentState.relationships,
      treaties: developmentState.treaties,
      recent_events: developmentState.events,
      recent_messages: [],
      ai_thinking_state: null,
      border_tension: [],
      winner: developmentState.winner,
      final_narration: developmentState.finalNarration,
    }
    const roomStarted: RoomStartedPayload = {
      room_id: roomId,
      mode: 'multi_4v4',
      status: 'running',
      players,
      ai_factions: aiFactions,
      settings: developmentState.settings,
      initial_state: {
        room: {
          id: roomId,
          status: 'running',
          mode: 'multi_4v4',
          players,
          ai_factions: aiFactions,
          current_player_id: players[0]?.player_id ?? 'mock-player-0',
        },
        current_turn: toReconnectEpochTurn(developmentState.epoch),
        factions: developmentState.factions,
        regions: developmentState.regions,
        relationships: developmentState.relationships,
        treaties: developmentState.treaties,
        recent_events: developmentState.events,
        recent_messages: developmentState.privateMessages,
        ai_thinking_state: null,
        border_tension: [],
        winner: developmentState.winner,
        final_narration: developmentState.finalNarration,
        settings: developmentState.settings,
      },
    }

    this.emit(nextEnvelope('conn.auth.ok', {
      player_id: gameStoreApi.getState().selectedFactionId ?? 'starlight',
      display_name: 'Mock Player',
      server_time_ms: Date.now(),
    }))
    this.emit(nextEnvelope('room.factions_meta', {
      room_id: roomId,
      schema_version: 'mock',
      factions_meta: factionMetaFixtures,
    }))
    if (!this.lobbyMode) {
      this.emit(nextEnvelope('room.snapshot', roomSnapshot))
      this.emit(nextEnvelope('room.started', roomStarted))
      this.emitTurnBegin(developmentState.epoch, developmentState)
      this.emit(nextEnvelope('room.world_geometry', createMockWorldGeometry(fixtureSeed)))
    }
    if (this.startMockLoopOnConnect) {
      void this.ensureMockLoop()
    }
  }

  disconnect() {
    this.connected = false
    this.stopMockLoop?.()
    this.stopMockLoop = null
    clearAIResponseTimers()
    this.handlers.clear()
  }

  on(handler: MessageHandler) {
    this.handlers.add(handler)
  }

  off(handler: MessageHandler) {
    this.handlers.delete(handler)
  }

  emitAIThinking(payload: {
    room_id: string
    faction_id: FactionId
    progress: number
    phase?: string
    model?: string | null
  }) {
    this.emit(nextEnvelope('ai.thinking', payload))
  }

  emitEpicNarration(epoch: Epoch) {
    this.emit(nextEnvelope('arbitrate.epic_narration', buildEpicNarrationPayload(epoch)))
  }

  emitSummaryNarration(epoch: Epoch) {
    this.emit(nextEnvelope('arbitrate.summary_narration', buildSummaryNarrationPayload(epoch)))
  }

  send(message: OutgoingMessage): SubmitSpeechResult {
    if (!this.connected) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    if (message.t === 'room.ready') {
      this.advancePhase()
      return { ok: true }
    }

    if (message.t === 'room.create') {
      const roomId = `mock-room-${Date.now()}`
      const mode = message.p.mode
      const hostPlayerId = gameStoreApi.getState().currentPlayerId ?? gameStoreApi.getState().selectedFactionId ?? 'starlight'
      const player: RoomPlayerSnapshot = {
        player_id: hostPlayerId,
        display_name: message.p.display_name,
        faction_id: null,
        connected: true,
        ready: false,
        ai_takeover: false,
      }
      const snapshot: RoomSnapshotPayload = {
        room_id: roomId,
        mode,
        status: 'lobby',
        players: [player],
        ai_factions: [],
        settings: createInitialState().settings,
        recent_events: [],
        recent_messages: [],
        border_tension: [],
      }
      this.emit(nextEnvelope('room.created', { room_id: roomId, mode }))
      this.emit(nextEnvelope('room.snapshot', snapshot))
      this.emit(nextEnvelope('room.joined', {
        room_id: roomId,
        room_snapshot: {
          room: {
            id: roomId,
            mode,
            status: 'lobby',
            players: [player],
            ai_factions: [],
          },
          current_player_id: hostPlayerId,
        },
      }))
      return { ok: true }
    }

    if (message.t === 'room.join') {
      const roomId = message.p.room_id || `mock-room-${Date.now()}`
      const playerId = gameStoreApi.getState().currentPlayerId ?? gameStoreApi.getState().selectedFactionId ?? 'starlight'
      const player: RoomPlayerSnapshot = {
        player_id: playerId,
        display_name: message.p.display_name,
        faction_id: null,
        connected: true,
        ready: false,
        ai_takeover: false,
      }
      const snapshot: RoomSnapshotPayload = {
        room_id: roomId,
        mode: 'multi_4v4',
        status: 'lobby',
        players: [player],
        ai_factions: [],
        settings: createInitialState().settings,
        recent_events: [],
        recent_messages: [],
        border_tension: [],
      }
      this.emit(nextEnvelope('room.joined', {
        room_id: roomId,
        room_snapshot: {
          room: {
            id: roomId,
            mode: 'multi_4v4',
            status: 'lobby',
            players: [player],
            ai_factions: [],
          },
          current_player_id: playerId,
        },
      }))
      this.emit(nextEnvelope('room.snapshot', snapshot))
      return { ok: true }
    }

    if (message.t === 'conn.ping') {
      this.emit(nextEnvelope('conn.pong', {
        server_time_ms: Date.now(),
      }))
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
      room_id: getRoomId(),
      epoch: epoch.id,
      turn: epoch.turn,
      phase: epoch.phase,
      arbitrate_phase: epoch.arbitratePhase,
      phase_started_at_ms: epoch.phaseStartedAt,
      phase_duration_ms: epoch.phaseDurationMs,
      server_time_ms: Date.now(),
      is_paused: isPaused,
    }))
  }

  emitTurnBegin(
    epoch: Epoch,
    visibleState: Pick<ReturnType<typeof gameStoreApi.getState>, 'factions' | 'relationships' | 'regions'> = gameStoreApi.getState(),
  ) {
    this.emit(nextEnvelope('turn.begin', {
      room_id: getRoomId(),
      epoch: epoch.id,
      turn: epoch.turn,
      phase: epoch.phase,
      arbitrate_phase: epoch.arbitratePhase,
      phase_started_at_ms: epoch.phaseStartedAt,
      phase_duration_ms: epoch.phaseDurationMs,
      server_time_ms: Date.now(),
      visible_snapshot: {
        epoch,
        factions: visibleState.factions,
        relationships: visibleState.relationships,
        regions: visibleState.regions,
      },
    }))
  }

  emitEvents(events: GameEvent[], privateMessages: PrivateMessage[] = []) {
    if (events.length === 0 && privateMessages.length === 0) {
      return
    }

    const { epoch } = gameStoreApi.getState()
    this.emit(nextEnvelope('resolve.events', {
      room_id: getRoomId(),
      epoch: epoch.id,
      turn: epoch.turn,
      events,
      private_messages: privateMessages.length > 0 ? privateMessages : undefined,
    }))
  }

  emitActionEvent(event: GameEvent, privateMessage?: PrivateMessage) {
    if (privateMessage) {
      this.emit(nextEnvelope('action.private', {
        room_id: getRoomId(),
        event,
        private_message: privateMessage,
      }))
      this.emitDiplomaticVisuals(event, privateMessage)
      return
    }

    this.emit(nextEnvelope('action.broadcast', {
      room_id: getRoomId(),
      event,
    }))
    this.emitDiplomaticVisuals(event)
  }

  emitAIEvent(event: GameEvent) {
    if (event.kind === 'ai_reaction') {
      this.emit(nextEnvelope('ai.reaction', {
        room_id: getRoomId(),
        event,
        faction_id: event.actor ?? 'starlight',
        reaction: typeof event.payload.label === 'string' ? event.payload.label : event.narration,
        target_faction: event.target ?? undefined,
      }))
      return
    }

    this.emit(nextEnvelope('ai.speak', {
      room_id: getRoomId(),
      event,
    }))
    this.emitDiplomaticVisuals(event)
  }

  emitAIPrivateMessage(event: GameEvent, privateMessage: PrivateMessage) {
    this.emit(nextEnvelope('ai.speak', {
      room_id: getRoomId(),
      event,
      private_message: privateMessage,
    }))
    this.emitDiplomaticVisuals(event, privateMessage)
  }

  emitMapDiff(changes: RegionChange[], borderUpdates: BorderTensionEntry[] = []) {
    if (changes.length === 0 && borderUpdates.length === 0) {
      return
    }

    const { epoch } = gameStoreApi.getState()
    this.emit(nextEnvelope('resolve.map_diff', {
      room_id: getRoomId(),
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
      room_id: getRoomId(),
      epoch: epoch.id,
      turn: epoch.turn,
      faction_stats: diff.faction_stats,
      relationship_changes: diff.relationship_changes,
    }))
  }

  emitRoomFinished(finalNarration = '第八纪元裁决完成，复盘即将开启。') {
    const factions = gameStoreApi.getState().factions
    const winner = factions.reduce<FactionId | null>((currentWinner, faction) => {
      if (currentWinner === null) {
        return faction.id
      }

      const current = factions.find((item) => item.id === currentWinner)
      return !current || faction.totalPower > current.totalPower ? faction.id : currentWinner
    }, null)

    this.emit(nextEnvelope('room.finished', {
      room_id: getRoomId(),
      winner,
      final_narration: finalNarration,
      replay_available: true,
    }))
  }

  tickPhase(deltaMs: number) {
    void deltaMs
  }

  private emitDiplomaticVisuals(event: GameEvent, privateMessage?: PrivateMessage) {
    const worldGeometry = gameStoreApi.getState().worldGeometry
    const actor = event.actor ?? privateMessage?.from
    const target = event.target ?? privateMessage?.to

    if (!worldGeometry || !actor) {
      return
    }

    if (event.kind !== 'speech' && event.kind !== 'private') {
      return
    }

    const visuals = createMockDiplomaticVisuals({
      actor,
      target,
      kind: event.kind,
      worldGeometry,
      createdAtMs: event.createdAt,
    })

    if (visuals.arcs.length > 0) {
      this.emit(nextEnvelope('resolve.diplomatic_arcs', {
        room_id: getRoomId(),
        arcs: visuals.arcs,
      }))
    }

    if (visuals.ripples.length > 0) {
      this.emit(nextEnvelope('resolve.ripple', {
        room_id: getRoomId(),
        ripples: visuals.ripples,
      }))
    }
  }

  advancePhase() {
    const previous = gameStoreApi.getState().epoch
    const next = nextEpochState(previous)

    if (!next) {
      this.emitPhase(previous, true)
      return null
    }

    this.emitPhase(next)

    if (next.phase === 'arbitrate' && next.arbitratePhase === 'epic') {
      this.emitEpicNarration(next)
    }

    if (next.phase === 'arbitrate' && next.arbitratePhase === 'summary') {
      this.emitSummaryNarration(next)
    }

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
      this.emitMapDiff([
        {
          region_id: regionId,
          prev_owner: region.owner,
          new_owner: attackerId,
          transition: 'conquest',
          animation_params: {
            direction: 'west_to_east',
            speed: 1.2,
            particles: 'aggressive',
          },
        },
      ])
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
        region_id: regionId,
        attacker: attackerId,
        defender: defenderId,
        atk_loss: attackerCasualties,
        def_loss: defenderCasualties,
        territory_captured: regionOwnerChanged,
        morale_shift: winner === attackerId ? 0.04 : -0.06,
        narrative: `${mockFactionById[attackerId].name}与${mockFactionById[defenderId].name}在${regionId}爆发战斗，${mockFactionById[winner].name}取得优势`,
        attacker_remaining_troops: attackerNext.military,
        defender_remaining_troops: defenderNext.military,
      },
      narration: `${mockFactionById[attackerId].name}与${mockFactionById[defenderId].name}在${regionId}爆发战斗，${mockFactionById[winner].name}取得优势`,
    }

    this.emitEvents([event])
    const explosionKind = region.terrain === 'river' ? 'naval' : 'conventional'
    const scorchedPlan = buildScorchedPlan(explosionKind)
    const affectedHexIds = collectNeighborHexIds(
      region,
      gameStoreApi.getState().regions,
      scorchedPlan.maxTotal,
      scorchedPlan.hopDepth,
    )
    this.emitExplosion({
      id: `${event.id}_explosion`,
      room_id: getRoomId(),
      epoch: state.epoch.id,
      turn: state.epoch.turn,
      region_id: regionId,
      centerLat: region.lat ?? region.centerLatLng[0],
      centerLng: region.lng ?? region.centerLatLng[1],
      intensity: regionOwnerChanged ? 1.35 : 1,
      kind: explosionKind,
      ttl_ms: 4000,
      created_at_ms: event.createdAt,
      affected_hex_ids: affectedHexIds,
      primary_hex_id: regionKey(region),
      economic_loss_pct: regionOwnerChanged ? 0.18 : 0.08,
      narrative_hint: `${mockFactionById[attackerId].name}的冲击波沿着${regionKey(region)}扩散，焦土将持续发酵。`,
    })

    const scorchedDiff = buildScorchedDiffPayload(region, explosionKind, state.epoch.turn)
    if (scorchedDiff.changes.length > 0) {
      this.emitScorchedDiff(scorchedDiff)
    }
  }

  private emitExplosion(payload: Extract<IncomingMessage, { t: 'resolve.event.explosion' }>['p']) {
    this.emit(nextEnvelope('resolve.event.explosion', payload))
  }

  private emitScorchedDiff(payload: ScorchedDiffPayload) {
    this.emit(nextEnvelope('resolve.scorched_diff', payload))
  }

  private handleClientSpeech(event: GameEvent) {
    triggerAIResponses(event, this)
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
      speech: `${mockFactionById[actor].name}发表公开演讲，预计文化影响 +${estimateCultureGain(content, toneHeat)}`,
      private: `${mockFactionById[actor].name}向${targetNames}发送加密密谈`,
      treaty: `${mockFactionById[actor].name}向${targetNames}提出${treatyLabel ?? '条约'}草案`,
      military: `${mockFactionById[actor].name}下达${militaryLabel ?? '战术'}军令`,
      intel: `${mockFactionById[actor].name}请求针对${targetNames}的情报`,
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
            subject: `密谈：${mockFactionById[target].name}`,
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
        narration: `${mockFactionById[actor].name}的强硬措辞被记录为潜在背叛倾向`,
      }))
    }

    this.handleClientSpeech(event)

    return { ok: true, eventId: event.id }
  }

  private emitRejected(message: OutgoingMessage, reason: string, errorCode: string) {
    this.emit(nextEnvelope('action.rejected', {
      room_id: 'room_id' in message.p ? message.p.room_id : getRoomId(),
      request_id: message.id,
      reason,
      error_code: errorCode,
    }))
  }

  private emit(message: IncomingMessage) {
    if (!this.connected) {
      return
    }

    if (this.latencyMs > 0) {
      globalThis.setTimeout(() => {
        if (!this.connected) {
          return
        }

        for (const handler of this.handlers) {
          handler(message)
        }
      }, this.latencyMs)
      return
    }

    for (const handler of this.handlers) {
      handler(message)
    }
  }

  private async ensureMockLoop() {
    if (!this.startMockLoopOnConnect || this.stopMockLoop) {
      return
    }

    if (!import.meta.env.DEV) {
      console.warn('startMockGameLoop skipped outside development build')
      return
    }

    const { startMockGameLoop } = await import('@/mock/gameLoop')
    if (!this.connected || !this.startMockLoopOnConnect || this.stopMockLoop) {
      return
    }

    this.stopMockLoop = startMockGameLoop(this)
  }
}

type ReconnectContext = {
  roomId?: string
  playerId?: string
  sessionToken?: string
}

type WireEnvelope = {
  v?: unknown
  id?: unknown
  t?: unknown
  ts?: unknown
  seq?: unknown
  p?: unknown
}

const DEFAULT_RECONNECT: ReconnectConfig = {
  enabled: true,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: Infinity,
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000
const MAX_OUTBOUND_QUEUE = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasMinimumEnvelopeFields(value: unknown): value is WireEnvelope {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.id === 'string' &&
    typeof value.t === 'string' &&
    typeof value.ts === 'number'
  )
}

export class WebSocketTransport implements Transport {
  private url: string
  private token?: string
  private clientVersion: string
  private playerId?: string
  private reconnect: ReconnectConfig
  private heartbeatIntervalMs: number
  private onStatusChange?: (status: TransportStatus) => void
  private handlers = new Set<MessageHandler>()
  private socket: WebSocket | null = null
  private status: TransportStatus = 'idle'
  private outboundSeq = 0
  private lastInboundSeq = 0
  private outboundQueue: OutgoingMessage[] = []
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private reconnectRequestTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private reconnectRequestAttempts = 0
  private heartbeatTimer: ReturnType<typeof globalThis.setInterval> | null = null
  private lastPongAt = 0
  private manuallyClosed = false
  private reconnectContext: ReconnectContext = {}
  private reconnectNegotiationActive = false
  private reconnectRetryRequested = false
  private reconnectDisabled = false

  constructor(
    url: string,
    token?: string,
    clientVersion = 'unknown',
    playerIdOrReconnect?: string | Partial<ReconnectConfig>,
    reconnectOrHeartbeat?: Partial<ReconnectConfig> | number,
    heartbeatOrStatus: number | ((status: TransportStatus) => void) = DEFAULT_HEARTBEAT_INTERVAL_MS,
    onStatusChange?: (status: TransportStatus) => void,
  ) {
    const hasPlayerId = typeof playerIdOrReconnect === 'string'
    const reconnect = hasPlayerId
      ? (reconnectOrHeartbeat as Partial<ReconnectConfig> | undefined)
      : (playerIdOrReconnect as Partial<ReconnectConfig> | undefined)
    const heartbeatIntervalMs = hasPlayerId
      ? typeof heartbeatOrStatus === 'number'
        ? heartbeatOrStatus
        : DEFAULT_HEARTBEAT_INTERVAL_MS
      : typeof reconnectOrHeartbeat === 'number'
        ? reconnectOrHeartbeat
        : DEFAULT_HEARTBEAT_INTERVAL_MS
    const statusChangeHandler = hasPlayerId
      ? onStatusChange
      : typeof heartbeatOrStatus === 'function'
        ? heartbeatOrStatus
        : onStatusChange

    this.url = url
    this.token = token
    this.clientVersion = clientVersion
    this.playerId = hasPlayerId ? playerIdOrReconnect : undefined
    this.reconnect = { ...DEFAULT_RECONNECT, ...reconnect }
    this.heartbeatIntervalMs = heartbeatIntervalMs
    this.onStatusChange = statusChangeHandler
  }

  connect() {
    if (this.status === 'connecting' || this.status === 'open') {
      return
    }

    this.manuallyClosed = false
    this.reconnectDisabled = false
    this.clearReconnectTimer()
    this.openSocket(false)
  }

  disconnect() {
    this.manuallyClosed = true
    this.reconnectDisabled = false
    this.clearReconnectTimer()
    this.clearReconnectRequestTimer()
    this.stopHeartbeat()
    this.handlers.clear()

    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close()
    }

    this.socket = null
    this.setStatus('closed')
  }

  send(message: OutgoingMessage): void {
    const envelope = this.prepareOutgoing(message)

    if (this.status !== 'open' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.enqueue(envelope)
      return
    }

    this.sendRaw(envelope)
  }

  on(handler: MessageHandler) {
    this.handlers.add(handler)
  }

  off(handler: MessageHandler) {
    this.handlers.delete(handler)
  }

  setReconnectContext(context: ReconnectContext) {
    this.reconnectContext = context
  }

  requestReconnect() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    if (this.reconnectDisabled) {
      return
    }

    if (!this.reconnectNegotiationActive) {
      this.beginReconnectNegotiation()
      return
    }

    this.reconnectRetryRequested = true
    this.sendReconnectRequest()
    this.scheduleReconnectRequestRetry()
  }

  getStatus() {
    return this.status
  }

  getLastInboundSeq() {
    return this.lastInboundSeq
  }

  getQueueDepth() {
    return this.outboundQueue.length
  }

  private openSocket(isReconnect: boolean) {
    this.stopHeartbeat()
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting')

    const socket = new WebSocket(this.buildUrl())
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) {
        return
      }

      this.reconnectAttempts = 0
      this.lastPongAt = Date.now()

      if (isReconnect) {
        this.beginReconnectNegotiation()
      } else {
        this.sendAuth()
        this.setStatus('open')
        this.startHeartbeat()
        this.flushQueue()
      }
    }

    socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data)
    }

    socket.onerror = () => {
      this.setStatus('error')
    }

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null
      }

      this.stopHeartbeat()

      if (this.manuallyClosed) {
        this.setStatus('closed')
        return
      }

      if (this.reconnectDisabled) {
        this.setStatus('error')
        return
      }

      this.scheduleReconnect()
    }
  }

  private buildUrl() {
    const baseUrl =
      typeof globalThis.location === 'undefined' ? 'http://localhost' : globalThis.location.href
    const url = new URL(this.url, baseUrl)
    if (this.token) {
      url.searchParams.set('token', this.token)
    }
    const playerId = this.reconnectContext.playerId ?? this.playerId
    if (playerId) {
      url.searchParams.set('player_id', playerId)
    }
    return url.toString()
  }

  private sendAuth() {
    this.sendRaw(this.createEnvelope('conn.auth', {
      token: this.token ?? '',
      client_version: this.clientVersion,
    }))
  }

  private sendReconnectRequest() {
    if (!this.reconnectContext.roomId || !this.reconnectContext.playerId) {
      console.warn('missing reconnect context; cannot request reconnect payload')
      return
    }

    this.sendRaw(this.createEnvelope('reconnect.request', {
      room_id: this.reconnectContext.roomId,
      player_id: this.reconnectContext.playerId,
      last_seq: this.lastInboundSeq,
      session_token: this.reconnectContext.sessionToken,
    }))
  }

  private beginReconnectNegotiation() {
    if (this.reconnectDisabled) {
      return
    }

    this.reconnectNegotiationActive = true
    this.reconnectRetryRequested = false
    this.reconnectRequestAttempts = 0
    this.stopHeartbeat()
    this.clearReconnectRequestTimer()
    this.setStatus('reconnecting')
    this.sendReconnectRequest()
    this.scheduleReconnectRequestRetry()
  }

  private completeReconnectNegotiation() {
    this.reconnectNegotiationActive = false
    this.reconnectRetryRequested = false
    this.reconnectRequestAttempts = 0
    this.reconnectDisabled = false
    this.clearReconnectRequestTimer()
    this.setStatus('open')
    this.startHeartbeat()
    this.flushQueue()
  }

  private failReconnectNegotiation(reason: string) {
    this.reconnectNegotiationActive = false
    this.reconnectRetryRequested = false
    this.reconnectDisabled = true
    this.clearReconnectRequestTimer()
    this.stopHeartbeat()
    console.warn(reason)
    useUIStore.getState().setConnectionFailureReason(reason)
    this.setStatus('error')
  }

  private scheduleReconnectRequestRetry() {
    this.clearReconnectRequestTimer()
    this.reconnectRequestTimer = globalThis.setTimeout(() => {
      this.reconnectRequestTimer = null

      if (!this.reconnectNegotiationActive) {
        return
      }

      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (this.reconnectRequestAttempts >= 3) {
        this.failReconnectNegotiation('reconnect request timed out')
        return
      }

      this.reconnectRequestAttempts += 1
      this.sendReconnectRequest()
      this.scheduleReconnectRequestRetry()
    }, 1000)
  }

  private clearReconnectRequestTimer() {
    if (this.reconnectRequestTimer !== null) {
      globalThis.clearTimeout(this.reconnectRequestTimer)
      this.reconnectRequestTimer = null
    }
  }

  private handleMessage(data: unknown) {
    let parsed: unknown

    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : JSON.parse(String(data))
    } catch {
      this.setStatus('error')
      return
    }

    if (!hasMinimumEnvelopeFields(parsed)) {
      this.setStatus('error')
      return
    }

    if (typeof parsed.seq === 'number' && Number.isFinite(parsed.seq)) {
      this.lastInboundSeq = parsed.seq
    }

    if (parsed.t === 'conn.pong') {
      this.lastPongAt = Date.now()
    }

    for (const handler of this.handlers) {
      handler(parsed as IncomingMessage)
    }

    if (parsed.t === 'reconnect.catchup' || parsed.t === 'reconnect.snapshot') {
      if (this.reconnectRetryRequested) {
        this.reconnectRetryRequested = false
        return
      }

      this.completeReconnectNegotiation()
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()

    this.heartbeatTimer = globalThis.setInterval(() => {
      if (this.status !== 'open' || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (Date.now() - this.lastPongAt >= this.heartbeatIntervalMs * 2) {
        this.socket.close()
        return
      }

      this.sendRaw(this.createEnvelope('conn.ping', {
        client_ts: Date.now(),
      }))
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      globalThis.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect() {
    if (!this.reconnect.enabled || this.reconnectAttempts >= this.reconnect.maxAttempts) {
      this.setStatus('closed')
      return
    }

    const delay = Math.min(
      this.reconnect.maxDelayMs,
      this.reconnect.baseDelayMs * 2 ** this.reconnectAttempts,
    )

    this.reconnectAttempts += 1
    this.setStatus('reconnecting')
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket(true)
    }, delay)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private flushQueue() {
    while (this.outboundQueue.length > 0) {
      const next = this.outboundQueue.shift()

      if (next) {
        this.sendRaw(next)
      }
    }
  }

  private enqueue(message: OutgoingMessage) {
    if (this.outboundQueue.length >= MAX_OUTBOUND_QUEUE) {
      this.outboundQueue.shift()
      console.warn('WebSocketTransport outbound queue is full; dropped the oldest message')
    }

    this.outboundQueue.push(message)
  }

  private prepareOutgoing(message: OutgoingMessage): OutgoingMessage {
    const nextSeq = this.nextOutboundSeq()

    return {
      ...message,
      id: message.id || `msg_${nextSeq.toString(36)}`,
      ts: message.ts || Date.now(),
      seq: message.seq || nextSeq,
    } as OutgoingMessage
  }

  private createEnvelope<T extends string>(type: T, payload: unknown) {
    const nextSeq = this.nextOutboundSeq()

    return {
      v: 1,
      id: `msg_${nextSeq.toString(36)}`,
      t: type,
      ts: Date.now(),
      seq: nextSeq,
      p: payload,
    }
  }

  private nextOutboundSeq() {
    this.outboundSeq += 1
    return this.outboundSeq
  }

  private sendRaw(message: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(JSON.stringify(message))
  }

  private setStatus(status: TransportStatus) {
    if (this.status === status) {
      return
    }

    this.status = status
    this.onStatusChange?.(status)
  }
}

export function createTransport(config: TransportConfig): Transport {
  if (config.kind === 'mock') {
    return new MockTransport(config.mock)
  }

  if (!config.ws) {
    throw new Error('WebSocket transport config is required when kind is "ws"')
  }

  return new WebSocketTransport(
    config.ws.url,
    config.ws.token,
    config.ws.clientVersion,
    config.ws.playerId ?? '',
    config.ws.reconnect,
    config.ws.heartbeatIntervalMs,
    config.ws.onStatusChange,
  )
}
