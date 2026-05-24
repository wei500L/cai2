import { create } from 'zustand'
import { tryConsumeRate } from '@/features/commandTerminal/RateLimiter'
import type { CommandSubmission, SubmitSpeechResult } from '@/features/commandTerminal/types'
import { treatyKindLabels, militaryActionLabels } from '@/features/commandTerminal/types'
import { factionMetaStore } from '@/store/factionMetaStore'
import { epochSummaryStore } from '@/store/epochSummaryStore'
import { FACTION_IDS, type FactionId } from '@/types/faction'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { createEmptyState } from '@/store/gameStoreEmpty'
import { createInitialState } from '@/store/gameStoreSeed'
import type {
  BattleEvent,
  Epoch,
  EventKind,
  FactionState,
  GameEvent,
  MapRegion,
  GameState,
  PrivateMessage,
  Relationship,
  RelationshipStatus,
  Treaty,
} from '@/types'
import type {
  BorderTensionEntry,
  DiaryEntry,
  EventBundlePayload,
  ExplosionEvent,
  ExplosionKind,
  FactionStatsPatch,
  DiplomaticArc,
  MapRegionPatch,
  RegionAnimationParams,
  RegionTransition,
  RegionTransitionLogEntry,
  PhasePayload,
  ReconnectAIThinkingState,
  ReconnectFullState,
  ReconnectSnapshotMessage,
  Ripple,
  RoomFinishedPayload,
  RoomPlayerSnapshot,
  RoomSnapshotPayload,
  RoomStartedPayload,
  RoomStartMessage,
  RelationshipPatch,
  StatsDiffPayload,
  RoomMode,
  ScorchedDiffPayload,
  TurnBeginPayload,
  WorldGeometryPayload,
} from '@/protocol/types'

const MAX_EVENTS = 200
const MAX_PRIVATE_MESSAGES = 100
const MAX_ACTIVE_DIPLOMATIC_ARCS = 24
const MAX_ACTIVE_RIPPLES = 24
type BorderTension = {
  tension: number
  visual_state: BorderTensionEntry['visual_state']
}

type WorldGeometryCapital = WorldGeometryPayload['factions'][number]

type RoomSnapshotInput = Omit<RoomSnapshotPayload, 'settings'> & {
  settings?: RoomSnapshotPayload['settings']
}

const activeDiplomaticArcTimers = new Map<string, ReturnType<typeof setTimeout>>()
const activeRippleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const MAX_AI_SPEAK_QUEUE = 50
const MAX_AI_REACTIONS_PER_EVENT = 12

type OpeningContentPayload = {
  room_id: string
  generated_at_ms: number
  world_prologue: string
  faction_briefs: Array<{ faction_id: FactionId; situation: string; goal_hint: string }>
  relationship_backstories: Array<{ from_faction: FactionId; to_faction: FactionId; backstory: string }>
  opening_events: Array<{ headline: string; narration: string; involved_factions: FactionId[] }>
  faction_speeches: Array<{ faction_id: FactionId; content: string }>
}

type AIThinkingState = ReconnectAIThinkingState & {
  fallback: boolean
  factionId: FactionId
  roomId: string
  receivedAtMs: number
}

type AISpeakKind = 'public' | 'private' | 'narration'

type AISpeakEvent = {
  id: string
  kind: AISpeakKind
  factionId: FactionId | null
  targetFactionId: FactionId | null
  text: string
  event: GameEvent
  privateMessage?: PrivateMessage
  sourceEventId: string | null
  createdAt: number
}

type AIReaction = {
  id: string
  eventId: string
  factionId: FactionId
  targetFactionId: FactionId | null
  reaction: string
  event: GameEvent
  createdAt: number
}

type GameStoreActions = {
  initGame: (seed?: number) => void
  resetGameState: (seed?: number) => void
  bootstrapEmpty: () => void
  pushEvent: (event: GameEvent) => void
  advancePhase: () => void
  tickPhase: (deltaMs: number) => void
  updateRelationship: (from: FactionId, to: FactionId, delta: number) => void
  updateRegionOwner: (regionId: string, newOwner: FactionId | null) => void
  applyBattleOutcome: (outcome: {
    attacker: FactionId
    defender: FactionId
    atkLoss?: number
    defLoss?: number
    moraleShift?: number | { attacker?: number; defender?: number }
  }) => void
  triggerBattle: (attackerId: FactionId, defenderId: FactionId, regionId: string) => void
  addPrivateMessage: (message: PrivateMessage) => void
  submitSpeech: (submission: CommandSubmission) => SubmitSpeechResult
  _applyPhase: (payload: Epoch | PhasePayload) => void
  _applyTurnBegin: (payload: TurnBeginPayload) => void
  _applyEvents: (payload: GameEvent[] | EventBundlePayload) => void
  handleExplosion: (payload: ExplosionEvent | Record<string, unknown>) => void
  applyScorchedDiff: (payload: ScorchedDiffPayload | { turn: number; changes: ScorchedDiffPayload['changes'] }) => void
  _applyDiplomaticArcs: (payload: { room_id: string; arcs: DiplomaticArc[] } | DiplomaticArc[]) => void
  _applyRipples: (payload: { room_id: string; ripples: Ripple[] } | Ripple[]) => void
  _applyMapDiff: (
    payload: MapRegionPatch[] | { changes: MapRegionPatch[]; border_updates?: BorderTensionEntry[] },
  ) => void
  applyWorldGeometry: (payload: WorldGeometryPayload) => void
  _applyStatsDiff: (payload: StatsDiffPayload | {
    faction_stats?: FactionStatsPatch[]
    relationship_changes?: RelationshipPatch[]
    border_updates?: BorderTensionEntry[]
  }) => void
  _applyAIDiaries: (payload: {
    room_id: string
    faction_id: FactionId
    entries: DiaryEntry[]
  }) => void
  _applyAIThinking: (payload: {
    room_id?: string
    faction_id: FactionId
    progress: number
    phase?: string
    model?: string | null
  }) => void
  _applyAISpeak: (payload: {
    room_id: string
    event: GameEvent
    private_message?: PrivateMessage
  }) => void
  _applyAIReaction: (payload: {
    room_id: string
    event: GameEvent
    faction_id: FactionId
    reaction: string
    target_faction?: FactionId | null
  }) => void
  applySnapshot: (payload: RoomSnapshotPayload | ReconnectSnapshotMessage['p'] | ReconnectFullState) => void
  applyRoomStarted: (payload: RoomStartedPayload | RoomStartMessage['p']) => void
  _applySnapshot: (payload: RoomSnapshotPayload | ReconnectSnapshotMessage['p'] | ReconnectFullState) => void
  _applyRoomStarted: (payload: RoomStartedPayload | RoomStartMessage['p']) => void
  _applyRoomCreated: (payload: { room_id: string; mode: RoomMode }) => void
  _applyServerClockSample: (serverTimeMs: number, clientTimeMs?: number) => void
  togglePause: () => void
  selectFaction: (id: FactionId) => void
  clearFaction: () => void
  hasDiariesRevealed: () => boolean
  _applyRoomJoined: (payload: Record<string, unknown>) => void
  _applyRoomSnapshot: (payload: RoomSnapshotInput) => void
  _applyPlayerTakeover: (payload: {
    room_id: string
    player_id: string
    faction_id: FactionId
    reason: 'disconnected_30s' | 'manual_leave'
  }) => void
  _applyPlayerResume: (payload: {
    room_id: string
    player_id: string
    faction_id: FactionId
  }) => void
  _applyRoomFinished: (payload: RoomFinishedPayload) => void
  _applyOpeningContent: (payload: OpeningContentPayload) => void
}

export type GameStoreState = GameState & {
  selectedFactionId: FactionId | null
  currentRoomId: string | null
  currentPlayerId: string | null
  roomMode: RoomMode | null
  roomStatus: string | null
  roomPlayers: RoomPlayerSnapshot[]
  aiFactions: FactionId[]
  currentTurn: Epoch | null
  aiThinkingState: (ReconnectAIThinkingState & { fallback: boolean }) | null
  aiThinkingByFaction: Map<FactionId, AIThinkingState>
  aiSpeakQueue: AISpeakEvent[]
  aiReactionByEvent: Map<string, AIReaction[]>
  lastAIThinking: AIThinkingState | null
  lastAISpeak: AISpeakEvent | null
  lastAIReaction: AIReaction | null
  borderTensionMap: Record<string, BorderTension>
  regionTransitionLog: RegionTransitionLogEntry[]
  diplomaticArcs: DiplomaticArc[]
  ripples: Ripple[]
  worldGeometry: {
    seed: number
    hex_resolution: number
    total_cells: number
    factions: WorldGeometryCapital[]
    capitals: WorldGeometryCapital[]
  } | null
  winner: FactionId | null
  finalNarration: string | null
  openingContent: OpeningContentPayload | null
  serverClockOffsetMs: number
  serverClockSampleAtMs: number
  aiDiaries: Record<FactionId, DiaryEntry[]>
} & GameStoreActions

let eventSequence = 0

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getRelationshipStatus(value: number): RelationshipStatus {
  if (value <= -60) {
    return 'hostile'
  }

  if (value <= -15) {
    return 'wary'
  }

  if (value < 25) {
    return 'neutral'
  }

  if (value < 65) {
    return 'friendly'
  }

  return 'allied'
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

function pushEventToList(events: GameEvent[], event: GameEvent) {
  if (events.some((item) => item.id === event.id)) {
    return events
  }

  return [event, ...events].slice(0, MAX_EVENTS)
}

function pushEventsToList(events: GameEvent[], incoming: GameEvent[]) {
  return incoming.reduce((nextEvents, event) => pushEventToList(nextEvents, event), events)
}

function pushPrivateMessagesToList(messages: PrivateMessage[], incoming: PrivateMessage[]) {
  const existingIds = new Set(messages.map((message) => message.id))
  const freshMessages = incoming.filter((message) => !existingIds.has(message.id))

  return [...freshMessages, ...messages].slice(0, MAX_PRIVATE_MESSAGES)
}

function eventSortKey(event: GameEvent) {
  return [
    event.seq ?? -1,
    event.createdAt,
    event.epoch,
    event.turn,
    event.id,
  ] as const
}

function privateMessageSortKey(message: PrivateMessage) {
  return [message.createdAt, message.epoch, message.turn, message.id] as const
}

function dedupeAndSortEvents(events: GameEvent[]) {
  const byId = new Map<string, GameEvent>()
  for (const event of events) {
    const existing = byId.get(event.id)
    if (!existing || compareTuple(eventSortKey(event), eventSortKey(existing)) > 0) {
      byId.set(event.id, event)
    }
  }

  return [...byId.values()].sort((left, right) => compareTuple(eventSortKey(right), eventSortKey(left)))
}

function dedupeAndSortPrivateMessages(messages: PrivateMessage[]) {
  const byId = new Map<string, PrivateMessage>()
  for (const message of messages) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message)
    }
  }

  return [...byId.values()].sort((left, right) =>
    compareTuple(privateMessageSortKey(right), privateMessageSortKey(left)),
  )
}

function clearVisualTimerMap(timerMap: Map<string, ReturnType<typeof setTimeout>>) {
  for (const timer of timerMap.values()) {
    clearTimeout(timer)
  }

  timerMap.clear()
}

function resetExpiringVisuals() {
  clearVisualTimerMap(activeDiplomaticArcTimers)
  clearVisualTimerMap(activeRippleTimers)
}

function settleExpiringVisuals<T extends { id: string; ttl_ms: number; created_at_ms?: number }>(
  current: T[],
  incoming: T[],
  timerMap: Map<string, ReturnType<typeof setTimeout>>,
  limit: number,
  onExpire: (id: string) => void,
) {
  const now = Date.now()
  const incomingIds = new Set(incoming.map((item) => item.id))
  const freshCurrent = current.filter((item) => !incomingIds.has(item.id))
  const merged = [
    ...incoming.map((item) => ({
      ...item,
      created_at_ms: item.created_at_ms ?? now,
    })),
    ...freshCurrent,
  ]
  const next = merged.filter((item) => {
    const createdAt = item.created_at_ms ?? now
    return now - createdAt < item.ttl_ms
  })

  const nextIds = new Set(next.map((item) => item.id))
  for (const [id, timer] of timerMap.entries()) {
    if (nextIds.has(id)) {
      continue
    }

    clearTimeout(timer)
    timerMap.delete(id)
  }

  for (const item of incoming) {
    const createdAt = item.created_at_ms ?? now
    const remaining = Math.max(0, createdAt + item.ttl_ms - now)
    const existingTimer = timerMap.get(item.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    timerMap.set(
      item.id,
      setTimeout(() => {
        timerMap.delete(item.id)
        onExpire(item.id)
      }, remaining),
    )
  }

  if (next.length <= limit) {
    return next
  }

  const kept = next.slice(0, limit)
  const keptIds = new Set(kept.map((item) => item.id))
  for (const [id, timer] of timerMap.entries()) {
    if (!keptIds.has(id)) {
      clearTimeout(timer)
      timerMap.delete(id)
    }
  }

  return kept
}

function compareTuple(left: readonly (string | number)[], right: readonly (string | number)[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) {
      continue
    }

    const leftValue = left[index]
    const rightValue = right[index]

    if (leftValue === undefined) {
      return -1
    }
    if (rightValue === undefined) {
      return 1
    }
    return leftValue < rightValue ? -1 : 1
  }

  return 0
}

function syncEpochAliases(epoch: Epoch, eventsWindow: GameEvent[]) {
  return {
    currentEpoch: epoch.id,
    currentPhase: epoch.phase,
    phaseStartedAt: epoch.phaseStartedAt,
    eventsWindow,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toNumberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNullableNumberValue(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return undefined
}

function toNullableStringValue(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }

  return typeof value === 'string' ? value : undefined
}

function toFactionIdValue(value: unknown): FactionId | null {
  return typeof value === 'string' && (FACTION_IDS as readonly string[]).includes(value) ? (value as FactionId) : null
}

function normalizeLatLng(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return [0, 0]
  }

  return [toNumberValue(value[0]), toNumberValue(value[1])]
}

function compactDefined<T>(value: readonly (T | null | undefined)[] | null | undefined): T[]
function compactDefined(value: unknown): unknown[]
function compactDefined(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: unknown[] = []
  for (const item of value) {
    if (item != null) {
      items.push(item)
    }
  }

  return items
}

function normalizeBorderState(value: unknown): BorderTensionEntry['visual_state'] {
  if (
    value === 'watch' ||
    value === 'tense' ||
    value === 'critical' ||
    value === 'hostile_sparking' ||
    value === 'war_frontline'
  ) {
    return value
  }

  return 'calm'
}

function normalizeBorderKey(pair: [string, string]) {
  return [...pair].sort().join(':')
}

function normalizeRegionTransition(value: unknown): RegionTransition {
  if (value === 'conquest' || value === 'cede' || value === 'negotiated' || value === 'abandoned') {
    return value
  }

  return 'conquest'
}

function normalizeExplosionKind(value: unknown): ExplosionKind {
  if (
    value === 'conventional' ||
    value === 'nuke' ||
    value === 'aerial' ||
    value === 'naval' ||
    value === 'uprising' ||
    value === 'siege'
  ) {
    return value
  }

  return 'conventional'
}

function normalizeAnimationParams(value: unknown): RegionAnimationParams {
  const raw = isRecord(value) ? value : {}
  const direction = raw.direction
  const particles = raw.particles

  return {
    direction:
      direction === 'south_to_north' ||
      direction === 'north_to_south' ||
      direction === 'east_to_west' ||
      direction === 'west_to_east'
        ? direction
        : 'west_to_east',
    speed: clamp(toNumberValue(raw.speed, 1), 1, 1.5),
    particles: particles === 'aggressive' || particles === 'neutral' ? particles : 'neutral',
  }
}

function normalizeRegion(region: unknown): MapRegion {
  const raw = isRecord(region) ? region : {}
  const neighbors = Array.isArray(raw.neighbors)
    ? raw.neighbors.filter((neighbor): neighbor is string => typeof neighbor === 'string')
    : []

  return {
    id: toStringValue(raw.id ?? raw.region_id),
    owner: toFactionIdValue(raw.owner ?? raw.owner_id),
    resourceValue: toNumberValue(raw.resourceValue ?? raw.resource_value),
    developmentLevel: toNumberValue(raw.developmentLevel ?? raw.development_level),
    elevation: toNullableNumberValue(raw.elevation ?? raw.altitude),
    resistance: toNumberValue(raw.resistance, 0),
    capturedAtTurn:
      typeof raw.capturedAtTurn === 'number'
        ? raw.capturedAtTurn
        : typeof raw.captured_at_turn === 'number'
          ? raw.captured_at_turn
          : null,
    centerLatLng: normalizeLatLng(raw.centerLatLng ?? raw.center_lat_lng),
    lat: toNullableNumberValue(raw.lat ?? raw.latitude),
    lng: toNullableNumberValue(raw.lng ?? raw.longitude),
    hex_id: toNullableStringValue(raw.hex_id ?? raw.hexId),
    terrain: (raw.terrain as MapRegion['terrain']) ?? 'plains',
    minGarrison: Math.max(0, Math.round(toNumberValue(raw.minGarrison ?? raw.min_garrison, 10))),
    supplyLines: Math.max(0, Math.round(toNumberValue(raw.supplyLines ?? raw.supply_lines, 1))),
    neighbors,
  }
}

function normalizeFaction(faction: unknown): FactionState {
  const raw = isRecord(faction) ? faction : {}
  const military = toNumberValue(raw.military)
  const economy = toNumberValue(raw.economy)
  const diplomacy = toNumberValue(raw.diplomacy)
  const culture = toNumberValue(raw.culture)
  const morale = toNumberValue(raw.morale, 0)
  const totalPower = toNumberValue(raw.totalPower ?? raw.total_power, military + economy + diplomacy + culture + morale)

  return {
    id: toFactionIdValue(raw.id) ?? 'starlight',
    military,
    economy,
    diplomacy,
    culture,
    morale,
    totalPower,
    status: (raw.status as FactionState['status']) ?? 'critical',
  }
}

function normalizeRelationship(relationship: unknown): Relationship {
  const raw = isRecord(relationship) ? relationship : {}
  const treaties = Array.isArray(raw.treaties)
    ? raw.treaties.filter((treaty): treaty is Treaty['kind'] => typeof treaty === 'string')
    : []

  return {
    from: toFactionIdValue(raw.from ?? raw.from_faction) ?? 'starlight',
    to: toFactionIdValue(raw.to ?? raw.to_faction) ?? 'starlight',
    value: toNumberValue(raw.value),
    status: (raw.status as RelationshipStatus) ?? 'neutral',
    treaties,
  }
}

function normalizeGameEvent(event: unknown): GameEvent {
  const raw = isRecord(event) ? event : {}
  return {
    id: toStringValue(raw.id),
    seq: typeof raw.seq === 'number' ? raw.seq : undefined,
    createdAt: toNumberValue(raw.createdAt ?? raw.created_at_ms),
    epoch: toNumberValue(raw.epoch, 1),
    turn: toNumberValue(raw.turn, 1),
    phase: (raw.phase as Epoch['phase']) ?? 'observe',
    priority: (raw.priority as GameEvent['priority']) ?? 'P2',
    kind: (raw.kind as GameEvent['kind']) ?? 'narration',
    actor: toFactionIdValue(raw.actor ?? raw.actor_faction) ?? undefined,
    target: toFactionIdValue(raw.target ?? raw.target_faction) ?? undefined,
    payload: isRecord(raw.payload) ? { ...raw.payload } : {},
    narration: toStringValue(raw.narration),
  }
}

function normalizePrivateMessage(message: unknown): PrivateMessage | null {
  const raw = isRecord(message) ? message : {}
  const id = toStringValue(raw.id)
  if (!id) {
    return null
  }

  const from = toFactionIdValue(raw.from ?? raw.from_faction)
  const toArray = Array.isArray(raw.to_factions) ? raw.to_factions : []
  const to = toFactionIdValue(raw.to ?? toArray[0] ?? raw.target_faction)

  return {
    id,
    createdAt: toNumberValue(raw.createdAt ?? raw.created_at_ms),
    epoch: toNumberValue(raw.epoch, 1),
    turn: toNumberValue(raw.turn, 1),
    phase: (raw.phase as Epoch['phase']) ?? 'observe',
    from: from ?? 'starlight',
    to: to ?? from ?? 'starlight',
    priority: (raw.priority as PrivateMessage['priority']) ?? 'P2',
    subject: toStringValue(raw.subject ?? raw.content ?? '密谈记录'),
    body: toStringValue(raw.body ?? raw.content),
    encrypted:
      typeof raw.encrypted === 'boolean'
        ? raw.encrypted
        : raw.visibility && isRecord(raw.visibility)
          ? raw.visibility.scope !== 'public'
          : true,
    payload: isRecord(raw.payload) ? { ...raw.payload } : {},
  }
}

function isReconnectPrivateMessage(message: unknown) {
  const raw = isRecord(message) ? message : {}
  if (raw.kind === 'private') {
    return true
  }

  if (raw.kind === 'public') {
    return false
  }

  return raw.visibility && isRecord(raw.visibility) ? raw.visibility.scope !== 'public' : false
}

function normalizeBorderTensionEntry(entry: unknown): [string, BorderTension] | null {
  const raw = isRecord(entry) ? entry : {}
  const between = Array.isArray(raw.between) ? raw.between : []
  if (between.length < 2 || typeof between[0] !== 'string' || typeof between[1] !== 'string') {
    return null
  }

  return [
    normalizeBorderKey([between[0], between[1]]),
    {
      tension: toNumberValue(raw.tension),
      visual_state: normalizeBorderState(raw.visual_state),
    },
  ]
}

function normalizeBorderTensionMap(entries: unknown): Record<string, BorderTension> {
  if (!Array.isArray(entries)) {
    return {}
  }

  return entries.reduce<Record<string, BorderTension>>((next, entry) => {
    const normalized = normalizeBorderTensionEntry(entry)
    if (normalized) {
      const [key, value] = normalized
      next[key] = value
    }
    return next
  }, {})
}

function normalizeGameSettings(value: unknown) {
  const raw = isRecord(value) ? value : {}
  const phaseDurationsRaw = isRecord(raw.phase_durations) ? raw.phase_durations : {}
  const phase_durations: NonNullable<GameState['settings']['phase_durations']> = {}

  for (const phase of ['observe', 'action', 'resolve', 'arbitrate'] as const) {
    const duration = phaseDurationsRaw[phase]
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      phase_durations[phase] = Math.max(0, Math.round(duration))
    }
  }

  return {
    phase_durations,
    turns_per_epoch: Math.max(0, Math.round(toNumberValue(raw.turns_per_epoch, 0))),
    max_epochs: Math.max(0, Math.round(toNumberValue(raw.max_epochs, 0))),
  }
}

function normalizeRegionPatch(patch: unknown): MapRegionPatch | null {
  const raw = isRecord(patch) ? patch : {}
  const regionId = toStringValue(raw.id ?? raw.region_id)
  if (!regionId) {
    return null
  }

  const normalized: MapRegionPatch = {
    id: regionId,
    region_id: regionId,
    prev_owner: toFactionIdValue(raw.prev_owner ?? raw.prevOwner),
    new_owner: toFactionIdValue(raw.new_owner ?? raw.newOwner ?? raw.owner),
    transition: normalizeRegionTransition(raw.transition),
    animation_params: normalizeAnimationParams(raw.animation_params ?? raw.animationParams),
  }

  const owner = toFactionIdValue(raw.owner ?? raw.new_owner ?? raw.newOwner)
  if (owner !== null) {
    normalized.owner = owner
  }
  if (typeof raw.resourceValue === 'number' || typeof raw.resource_value === 'number') {
    normalized.resourceValue = toNumberValue(raw.resourceValue ?? raw.resource_value)
  }
  if (typeof raw.developmentLevel === 'number' || typeof raw.development_level === 'number') {
    normalized.developmentLevel = toNumberValue(raw.developmentLevel ?? raw.development_level)
  }
  if (typeof raw.elevation === 'number' || typeof raw.altitude === 'number') {
    normalized.elevation = toNullableNumberValue(raw.elevation ?? raw.altitude)
  }
  if (typeof raw.resistance === 'number') {
    normalized.resistance = toNumberValue(raw.resistance)
  }
  if (typeof raw.capturedAtTurn === 'number' || typeof raw.captured_at_turn === 'number') {
    normalized.capturedAtTurn = toNumberValue(raw.capturedAtTurn ?? raw.captured_at_turn)
  }
  if (typeof raw.terrain === 'string') {
    normalized.terrain = raw.terrain as MapRegion['terrain']
  }
  if (Array.isArray(raw.centerLatLng) || Array.isArray(raw.center_lat_lng)) {
    normalized.centerLatLng = normalizeLatLng(raw.centerLatLng ?? raw.center_lat_lng)
  }
  if ('lat' in raw || 'latitude' in raw) {
    normalized.lat = toNullableNumberValue(raw.lat ?? raw.latitude)
  }
  if ('lng' in raw || 'longitude' in raw) {
    normalized.lng = toNullableNumberValue(raw.lng ?? raw.longitude)
  }
  if ('hex_id' in raw || 'hexId' in raw) {
    normalized.hex_id = toNullableStringValue(raw.hex_id ?? raw.hexId)
  }
  if ('elevation' in raw || 'altitude' in raw) {
    normalized.elevation = toNullableNumberValue(raw.elevation ?? raw.altitude)
  }
  if (typeof raw.minGarrison === 'number' || typeof raw.min_garrison === 'number') {
    normalized.minGarrison = Math.round(toNumberValue(raw.minGarrison ?? raw.min_garrison))
  }
  if (typeof raw.supplyLines === 'number' || typeof raw.supply_lines === 'number') {
    normalized.supplyLines = Math.round(toNumberValue(raw.supplyLines ?? raw.supply_lines))
  }
  if (Array.isArray(raw.neighbors)) {
    normalized.neighbors = raw.neighbors.filter((neighbor): neighbor is string => typeof neighbor === 'string')
  }

  return normalized
}

function normalizeEpochTurn(value: unknown): Epoch | null {
  const raw = isRecord(value) ? value : {}
  const epoch = toNumberValue(raw.id ?? raw.epoch)
  if (!epoch) {
    return null
  }

  return {
    id: epoch,
    turn: toNumberValue(raw.turn, 1),
    phase: (raw.phase as Epoch['phase']) ?? 'observe',
    arbitratePhase: (raw.arbitratePhase ?? raw.arbitrate_phase) as Epoch['arbitratePhase'] | undefined,
    phaseStartedAt: toNumberValue(raw.phaseStartedAt ?? raw.phase_started_at_ms),
    phaseDurationMs: toNumberValue(raw.phaseDurationMs ?? raw.phase_duration_ms),
  }
}

function normalizeSnapshotPayload(payload: unknown) {
  const raw = isRecord(payload) ? payload : {}
  const currentTurn = normalizeEpochTurn(raw.current_turn ?? raw.currentTurn ?? raw.epoch)
  const room = isRecord(raw.room) ? raw.room : {}
  const settings = normalizeGameSettings(raw.settings ?? room.settings)

  return {
    currentTurn,
    factions: compactDefined(raw.factions).map((faction) => normalizeFaction(faction)),
    regions: compactDefined(raw.regions).map((region) => normalizeRegion(region)),
    relationships: compactDefined(raw.relationships).map((relationship) => normalizeRelationship(relationship)),
    treaties: compactDefined(raw.treaties).map((treaty) => ({ ...treaty })),
    events: compactDefined(raw.recent_events).map((event) => normalizeGameEvent(event)),
    privateMessages: compactDefined(raw.recent_messages)
      .filter((message) => isReconnectPrivateMessage(message))
      .map((message) => normalizePrivateMessage(message))
      .filter((message): message is PrivateMessage => message !== null),
    aiThinkingState: raw.ai_thinking_state
      ? { ...(raw.ai_thinking_state as ReconnectAIThinkingState), fallback: false }
      : null,
    borderTensionMap: normalizeBorderTensionMap(raw.border_tension ?? raw.borderTension),
    winner: toFactionIdValue(raw.winner),
    finalNarration: typeof raw.final_narration === 'string' ? raw.final_narration : null,
    settings,
  }
}

function normalizeVisibleSnapshot(payload: unknown) {
  const raw = isRecord(payload) ? payload : {}
  const epoch = normalizeEpochTurn(raw.epoch ?? raw.current_turn ?? raw.currentTurn)

  return {
    epoch,
    factions: compactDefined(raw.factions).map((faction) => normalizeFaction(faction)),
    regions: compactDefined(raw.regions).map((region) => normalizeRegion(region)),
    relationships: compactDefined(raw.relationships).map((relationship) => normalizeRelationship(relationship)),
  }
}

function normalizeRoomSnapshot(payload: unknown) {
  const raw = isRecord(payload) ? payload : {}

  return {
    room_id: toStringValue(raw.room_id ?? raw.roomId ?? raw.id),
    mode: (raw.mode as RoomMode) ?? 'solo_1v7',
    status: toStringValue(raw.status, 'unknown'),
    players: compactDefined(raw.players).map(normalizeRoomPlayer),
    ai_factions: compactDefined(raw.ai_factions).filter(
      (faction): faction is FactionId => typeof faction === 'string' && (FACTION_IDS as readonly string[]).includes(faction),
    ),
    settings: normalizeGameSettings(raw.settings),
  }
}

function normalizeRoomStartedPayload(payload: unknown) {
  const raw = isRecord(payload) ? payload : {}
  const initialState = isRecord(raw.initial_state) ? raw.initial_state : {}
  const initialStateRoom = isRecord(initialState.room) ? initialState.room : {}
  const normalizedInitialState = normalizeSnapshotPayload(initialState)
  const room = normalizeRoomSnapshot({
    room_id: raw.room_id,
    mode: raw.mode ?? initialStateRoom.mode,
    status: raw.status ?? 'running',
    players: raw.players ?? initialStateRoom.players,
    ai_factions: raw.ai_factions ?? initialStateRoom.ai_factions,
    settings: raw.settings ?? initialState.settings,
  })

  return {
    room,
    initialState: normalizedInitialState,
    settings: normalizeGameSettings(raw.settings ?? initialState.settings),
  }
}

function normalizeActionEvents(payload: unknown) {
  const raw = isRecord(payload) ? payload : {}
  const events = compactDefined(raw.events).map((event) => normalizeGameEvent(event))
  const privateMessages = compactDefined(raw.private_messages)
    .map((message) => normalizePrivateMessage(message))
    .filter((message): message is PrivateMessage => message !== null)

  return { events, privateMessages }
}

function isAIResponsePayload(payload: Record<string, unknown>) {
  return payload.source === 'template' || payload.aiGenerated === true
}

function getEventSourceId(event: GameEvent) {
  const payload = isRecord(event.payload) ? event.payload : {}
  const rawSourceId =
    payload.sourceEventId ??
    payload.source_event_id ??
    payload.eventId ??
    payload.event_id ??
    payload.messageId ??
    payload.message_id

  return typeof rawSourceId === 'string' ? rawSourceId : null
}

function normalizeAISpeakEntry(
  event: GameEvent,
  privateMessage?: PrivateMessage,
): AISpeakEvent | null {
  const payload = isRecord(event.payload) ? event.payload : {}
  if ((!isAIResponsePayload(payload) && !privateMessage) || event.kind === 'ai_reaction') {
    return null
  }

  const privatePayload = privateMessage && isRecord(privateMessage.payload) ? privateMessage.payload : {}
  const sourceEventId =
    getEventSourceId(event) ??
    (typeof privatePayload.sourceEventId === 'string' ? privatePayload.sourceEventId : null) ??
    (typeof privatePayload.source_event_id === 'string' ? privatePayload.source_event_id : null) ??
    null
  const createdAt = privateMessage?.createdAt ?? event.createdAt
  const factionId = event.actor ?? privateMessage?.from ?? null

  const targetFactionId = event.target ?? privateMessage?.to ?? null
  const text =
    (typeof payload.text === 'string' && payload.text) ||
    event.narration ||
    privateMessage?.body ||
    (typeof payload.content === 'string' ? payload.content : '') ||
    ''

  const kind: AISpeakKind =
    privateMessage || event.kind === 'private'
      ? 'private'
      : event.kind === 'narration' || payload.kind === 'narration'
        ? 'narration'
        : 'public'

  return {
    id: event.id,
    kind,
    factionId,
    targetFactionId: targetFactionId ?? null,
    text,
    event,
    privateMessage,
    sourceEventId,
    createdAt,
  }
}

function normalizeAIReactionEntry(event: GameEvent) {
  const payload = isRecord(event.payload) ? event.payload : {}
  if (!isAIResponsePayload(payload) && event.kind !== 'ai_reaction') {
    return null
  }

  const factionId = event.actor
  if (!factionId) {
    return null
  }

  const sourceEventId = getEventSourceId(event)
  if (!sourceEventId) {
    return null
  }

  const reaction =
    (typeof payload.reaction === 'string' && payload.reaction) ||
    (typeof payload.label === 'string' && payload.label) ||
    event.narration ||
    ''

  return {
    id: event.id,
    eventId: sourceEventId,
    factionId,
    targetFactionId: event.target ?? null,
    reaction,
    event,
    createdAt: event.createdAt,
  } satisfies AIReaction
}

function buildAIStateFromStreams(events: GameEvent[], privateMessages: PrivateMessage[]) {
  const privateBySourceEventId = new Map<string, PrivateMessage>()
  for (const message of privateMessages) {
    const payload = isRecord(message.payload) ? message.payload : {}
    const sourceEventId =
      typeof payload.sourceEventId === 'string'
        ? payload.sourceEventId
        : typeof payload.source_event_id === 'string'
          ? payload.source_event_id
          : null

    if (sourceEventId) {
      privateBySourceEventId.set(sourceEventId, message)
    }
  }

  const aiSpeakQueue: AISpeakEvent[] = []
  const aiThinkingByFaction = new Map<FactionId, AIThinkingState>()
  const aiReactionByEvent = new Map<string, AIReaction[]>()
  let lastAIThinking: AIThinkingState | null = null
  let lastAISpeak: AISpeakEvent | null = null
  let lastAIReaction: AIReaction | null = null

  const orderedEvents = [...events].sort((left, right) => compareTuple(eventSortKey(left), eventSortKey(right)))
  for (const event of orderedEvents) {
    if (event.kind === 'ai_thinking') {
      const payload = isRecord(event.payload) ? event.payload : {}
      const factionId = event.actor ?? toFactionIdValue(payload.faction_id)
      if (!factionId) {
        continue
      }

      const thinking: AIThinkingState = {
        progress: clamp(toNumberValue(payload.progress, 0), 0, 1),
        phase: typeof payload.phase === 'string' ? payload.phase : event.phase,
        model: typeof payload.model === 'string' ? payload.model : null,
        elapsed_ms: toNumberValue(payload.elapsed_ms, 0),
        fallback: false,
        factionId,
        roomId: typeof payload.room_id === 'string' ? payload.room_id : '',
        receivedAtMs: event.createdAt,
      }

      aiThinkingByFaction.set(factionId, thinking)
      lastAIThinking = thinking
      continue
    }

    const privateMessage = event.kind === 'private'
      ? privateBySourceEventId.get(getEventSourceId(event) ?? '') ?? undefined
      : undefined
    const speakEntry = normalizeAISpeakEntry(event, privateMessage)
    if (speakEntry) {
      aiSpeakQueue.unshift(speakEntry)
      if (aiSpeakQueue.length > MAX_AI_SPEAK_QUEUE) {
        aiSpeakQueue.length = MAX_AI_SPEAK_QUEUE
      }
      lastAISpeak = speakEntry

      if (speakEntry.kind !== 'public') {
        continue
      }
    }

    const reactionEntry = normalizeAIReactionEntry(event)
    if (!reactionEntry) {
      continue
    }

    const nextList = aiReactionByEvent.get(reactionEntry.eventId) ?? []
    nextList.unshift(reactionEntry)
    if (nextList.length > MAX_AI_REACTIONS_PER_EVENT) {
      nextList.length = MAX_AI_REACTIONS_PER_EVENT
    }
    aiReactionByEvent.set(reactionEntry.eventId, nextList)
    lastAIReaction = reactionEntry
  }

  return {
    aiThinkingByFaction,
    aiSpeakQueue,
    aiReactionByEvent,
    lastAIThinking,
    lastAISpeak,
    lastAIReaction,
  }
}

function normalizeExplosionEvent(payload: unknown, regions: MapRegion[]): ExplosionEvent {
  const rawPayload = isRecord(payload) ? payload : {}
  const raw = isRecord(rawPayload.event) ? rawPayload.event : rawPayload
  const regionId = toStringValue(raw.region_id ?? raw.regionId)
  const region = regionId ? regions.find((item) => item.id === regionId) : undefined
  const primaryHexId = toStringValue(raw.primary_hex_id ?? raw.primaryHexId, region?.hex_id ?? regionId)
  const affectedHexIds = Array.isArray(raw.affected_hex_ids)
    ? raw.affected_hex_ids.filter((hexId): hexId is string => typeof hexId === 'string')
    : Array.isArray(raw.affectedHexIds)
      ? raw.affectedHexIds.filter((hexId): hexId is string => typeof hexId === 'string')
      : primaryHexId
        ? [primaryHexId]
        : []
  const centerLat = toNumberValue(
    raw.centerLat ?? raw.center_lat ?? raw.lat ?? raw.latitude ?? region?.lat ?? region?.centerLatLng[0],
    0,
  )
  const centerLng = toNumberValue(
    raw.centerLng ?? raw.center_lng ?? raw.lng ?? raw.longitude ?? region?.lng ?? region?.centerLatLng[1],
    0,
  )
  const ttlMs = Math.round(clamp(toNumberValue(raw.ttl_ms ?? raw.ttlMs, 4000), 500, 6000))
  const intensity = clamp(toNumberValue(raw.intensity, 1), 0.5, 3)

  return {
    id: toStringValue(raw.id, createEventId('explosion')),
    room_id: typeof (raw.room_id ?? rawPayload.room_id) === 'string'
      ? ((raw.room_id ?? rawPayload.room_id) as string)
      : undefined,
    epoch: toNullableNumberValue(raw.epoch ?? rawPayload.epoch) ?? undefined,
    turn: toNullableNumberValue(raw.turn ?? rawPayload.turn) ?? undefined,
    region_id: regionId || undefined,
    centerLat,
    centerLng,
    intensity,
    kind: normalizeExplosionKind(raw.kind),
    ttl_ms: ttlMs,
    created_at_ms: toNullableNumberValue(raw.created_at_ms ?? raw.createdAtMs) ?? Date.now(),
    affected_hex_ids: affectedHexIds,
    primary_hex_id: primaryHexId || regionId,
    economic_loss_pct: clamp(toNumberValue(raw.economic_loss_pct ?? raw.economicLossPct, 0), 0, 1),
    narrative_hint: toStringValue(raw.narrative_hint ?? raw.narrativeHint, ''),
  }
}

function updateRoomPlayer(
  roomPlayers: RoomPlayerSnapshot[],
  playerId: string,
  patch: Partial<RoomPlayerSnapshot>,
) {
  return roomPlayers.map((player) =>
    player.player_id === playerId ? { ...player, ...patch } : player,
  )
}

function normalizeRoomPlayer(player: RoomPlayerSnapshot): RoomPlayerSnapshot {
  const raw = (isRecord(player) ? player : {}) as Partial<RoomPlayerSnapshot> & Record<string, unknown>
  return {
    player_id: toStringValue(raw.player_id ?? raw.id),
    display_name: toStringValue(raw.display_name),
    faction_id: toFactionIdValue(raw.faction_id ?? raw.factionId),
    connected: Boolean(raw.connected),
    ready: Boolean(raw.ready),
    ai_takeover: Boolean(raw.ai_takeover),
  }
}

function emptyAIDiaries() {
  return {} as Record<FactionId, DiaryEntry[]>
}

function createEventId(prefix: string) {
  eventSequence += 1
  return `${prefix}_${Date.now()}_${eventSequence}`
}

function createPhaseKey(epoch: Epoch) {
  return `E${epoch.id}:T${epoch.turn}:${epoch.phase}`
}

function isKnownFaction(value: string): value is FactionId {
  return (FACTION_IDS as readonly string[]).includes(value)
}

function getTargetNames(targets: FactionId[]) {
  const metaById = factionMetaStore.getState().byId
  return targets.map((target) => metaById[target]?.name ?? target).join('、')
}

function getFactionName(id: FactionId) {
  return factionMetaStore.getState().byId[id]?.name ?? id
}

function findMentionedFaction(content: string, actor: FactionId) {
  return Object.values(factionMetaStore.getState().byId).find(
    (faction) =>
      faction && faction.id !== actor && (content.includes(faction.name) || content.includes(faction.id)),
  )?.id
}

function isDeclareWarSubmission(submission: CommandSubmission, content: string) {
  if (submission.mode === 'military') {
    return content.includes('宣战')
  }

  if (submission.mode === 'treaty') {
    return /宣战|敌对|开战|战争状态/.test(content)
  }

  return false
}

function estimateCultureGain(content: string, toneHeat: number) {
  const wordGain = Math.min(5, Math.floor(content.trim().length / 48))
  const toneGain = toneHeat < 45 ? 2 : toneHeat < 72 ? 1 : 0

  return Math.max(1, 1 + wordGain + toneGain)
}

function canDirectIntel(actor: FactionId) {
  const meta = factionMetaStore.getState().byId[actor]
  return meta?.intel_capable ?? false
}

function validateSubmission(submission: CommandSubmission) {
  const content = submission.content.trim()

  if (!content) {
    return '指令内容不能为空'
  }

  if (content.length > 400) {
    return '指令内容超过 400 字'
  }

  const unknownTarget = submission.targets.find((target) => !isKnownFaction(target))
  if (unknownTarget) {
    return `未知目标势力：${unknownTarget}`
  }

  if (submission.mode === 'speech') {
    return null
  }

  if (submission.mode === 'private' && submission.targets.length !== 1) {
    return '密谈必须选择且仅选择一个目标势力'
  }

  if (submission.mode === 'treaty') {
    if (submission.targets.length < 1 || submission.targets.length > 3) {
      return '条约必须选择 1 到 3 个目标势力'
    }

    if (!submission.treatyKind) {
      return '条约必须选择条约种类'
    }
  }

  if (submission.mode === 'military') {
    if (
      !submission.military?.unitId ||
      !submission.military.sourceRegionId ||
      !submission.military.targetRegionId ||
      !submission.military.action
    ) {
      return '军令必须包含部队、来源区域、目标区域与动作'
    }
  }

  if (submission.mode === 'intel' && submission.targets.length !== 1) {
    return '情报模式必须选择一个目标势力'
  }

  return null
}

function nextEpochState(epoch: Epoch, settings: GameState['settings']): Epoch | null {
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

function updateRelationshipValue(
  relationships: Relationship[],
  from: FactionId,
  to: FactionId,
  delta: number,
) {
  return relationships.map((relationship) => {
    if (relationship.from !== from || relationship.to !== to) {
      return relationship
    }

    const value = clamp(relationship.value + delta, -100, 100)
    const treaties =
      value < 50 ? relationship.treaties.filter((treaty) => treaty !== 'alliance') : relationship.treaties

    return {
      ...relationship,
      value,
      status: getRelationshipStatus(value),
      treaties,
    }
  })
}

const initialState = createEmptyState()

export const useGameStore = create<GameStoreState>((set, get) => ({
  ...initialState,
  selectedFactionId: null,
  currentRoomId: null,
  currentPlayerId: null,
  roomMode: null,
  roomStatus: null,
  roomPlayers: [],
  aiFactions: [],
  currentTurn: initialState.epoch,
  aiThinkingState: null,
  aiThinkingByFaction: new Map(),
  aiSpeakQueue: [],
  aiReactionByEvent: new Map(),
  lastAIThinking: null,
  lastAISpeak: null,
  lastAIReaction: null,
  borderTensionMap: {},
  regionTransitionLog: [],
  diplomaticArcs: [],
  ripples: [],
  worldGeometry: null,
  winner: null,
  finalNarration: null,
  openingContent: null,
  serverClockOffsetMs: 0,
  serverClockSampleAtMs: 0,
  aiDiaries: emptyAIDiaries(),

  initGame: (seed) => {
    const nextState = createInitialState(seed)
    resetExpiringVisuals()
    epochSummaryStore.getState().reset()
    useMapStore.setState({
      scorchedRegions: new Map(),
      explosionQueue: [],
    })
    set((state) => ({
      ...nextState,
      selectedFactionId: state.selectedFactionId,
      currentRoomId: state.currentRoomId,
      currentPlayerId: state.currentPlayerId,
      roomMode: state.roomMode,
      roomStatus: state.roomStatus,
      roomPlayers: state.roomPlayers,
      aiFactions: state.aiFactions,
      currentTurn: nextState.epoch,
      aiThinkingState: state.aiThinkingState,
      aiThinkingByFaction: new Map(),
      aiSpeakQueue: [],
      aiReactionByEvent: new Map(),
      lastAIThinking: null,
      lastAISpeak: null,
      lastAIReaction: null,
      borderTensionMap: state.borderTensionMap,
      regionTransitionLog: [],
      diplomaticArcs: [],
      ripples: [],
      worldGeometry: null,
      winner: state.winner,
      finalNarration: state.finalNarration,
      serverClockOffsetMs: state.serverClockOffsetMs,
      serverClockSampleAtMs: state.serverClockSampleAtMs,
      aiDiaries: emptyAIDiaries(),
      status: nextState.status,
      eventsWindow: [...nextState.events],
      currentEpoch: nextState.epoch.id,
      currentPhase: nextState.epoch.phase,
      phaseStartedAt: nextState.epoch.phaseStartedAt,
    }))
  },

  resetGameState: (seed) => {
    if (!import.meta.env.DEV) {
      throw new Error('resetGameState is not allowed in production')
    }

    const nextState = createInitialState(seed)
    resetExpiringVisuals()
    epochSummaryStore.getState().reset()
    useMapStore.setState({
      scorchedRegions: new Map(),
      explosionQueue: [],
    })
    set((state) => ({
      ...nextState,
      selectedFactionId: state.selectedFactionId,
      currentRoomId: state.currentRoomId,
      currentPlayerId: state.currentPlayerId,
      roomMode: state.roomMode,
      roomStatus: state.roomStatus,
      roomPlayers: state.roomPlayers,
      aiFactions: state.aiFactions,
      currentTurn: nextState.epoch,
      aiThinkingState: state.aiThinkingState,
      borderTensionMap: state.borderTensionMap,
      regionTransitionLog: [],
      diplomaticArcs: [],
      ripples: [],
      worldGeometry: null,
      winner: state.winner,
      finalNarration: state.finalNarration,
      serverClockOffsetMs: state.serverClockOffsetMs,
      serverClockSampleAtMs: state.serverClockSampleAtMs,
      aiDiaries: emptyAIDiaries(),
      status: nextState.status,
      eventsWindow: [...nextState.events],
      currentEpoch: nextState.epoch.id,
      currentPhase: nextState.epoch.phase,
      phaseStartedAt: nextState.epoch.phaseStartedAt,
    }))
  },

  bootstrapEmpty: () => {
    const nextState = createEmptyState()
    resetExpiringVisuals()
    epochSummaryStore.getState().reset()
    useMapStore.setState({
      scorchedRegions: new Map(),
      explosionQueue: [],
    })
    set({
      ...nextState,
      selectedFactionId: get().selectedFactionId,
      currentRoomId: null,
      currentPlayerId: null,
      roomMode: null,
      roomStatus: null,
      roomPlayers: [],
      aiFactions: [],
      currentTurn: nextState.epoch,
      aiThinkingState: null,
      borderTensionMap: {},
      regionTransitionLog: [],
      diplomaticArcs: [],
      ripples: [],
      worldGeometry: null,
      winner: null,
      finalNarration: null,
      serverClockOffsetMs: 0,
      serverClockSampleAtMs: 0,
      aiDiaries: emptyAIDiaries(),
      status: nextState.status,
      ...syncEpochAliases(nextState.epoch, []),
    })
  },

  pushEvent: (event) => {
    set((state) => ({
      events: pushEventToList(state.events, event),
      eventsWindow: pushEventToList(state.eventsWindow, event),
    }))
  },

  advancePhase: () => {
    set((state) => {
      const epoch = nextEpochState(state.epoch, state.settings)

      if (!epoch) {
        return { isPaused: true }
      }

      return {
        epoch,
        currentEpoch: epoch.id,
        currentPhase: epoch.phase,
        phaseStartedAt: epoch.phaseStartedAt,
      }
    })
  },

  tickPhase: (deltaMs) => {
    if (deltaMs <= 0) {
      return
    }

    set((state) => {
      if (state.isPaused) {
        return state
      }

      return {
        epoch: {
          ...state.epoch,
          phaseDurationMs: Math.max(0, state.epoch.phaseDurationMs - deltaMs),
        },
      }
    })
  },

  updateRelationship: (from, to, delta) => {
    set((state) => ({
      relationships: updateRelationshipValue(state.relationships, from, to, delta),
    }))
  },

  updateRegionOwner: (regionId, newOwner) => {
    set((state) => ({
      regions: state.regions.map((region) =>
        region.id === regionId ? { ...region, owner: newOwner } : region,
      ),
    }))
  },

  applyBattleOutcome: ({ attacker, defender, atkLoss = 0, defLoss = 0, moraleShift = 0 }) => {
    const attackerMoraleShift =
      typeof moraleShift === 'number' ? Math.max(1, Math.round(moraleShift)) : moraleShift.attacker ?? 0
    const defenderMoraleShift =
      typeof moraleShift === 'number' ? -Math.max(1, Math.round(moraleShift)) : moraleShift.defender ?? 0

    set((state) => ({
      factions: state.factions.map((faction) => {
        if (faction.id === attacker) {
          return recalculateFaction({
            ...faction,
            military: clamp(faction.military - Math.max(0, Math.round(atkLoss)), 0, 100),
            morale: clamp(faction.morale + attackerMoraleShift, 0, 100),
          })
        }

        if (faction.id === defender) {
          return recalculateFaction({
            ...faction,
            military: clamp(faction.military - Math.max(0, Math.round(defLoss)), 0, 100),
            morale: clamp(faction.morale + defenderMoraleShift, 0, 100),
          })
        }

        return faction
      }),
    }))
  },

  triggerBattle: (attackerId, defenderId, regionId) => {
    set((state) => {
      const attacker = state.factions.find((faction) => faction.id === attackerId)
      const defender = state.factions.find((faction) => faction.id === defenderId)
      const region = state.regions.find((item) => item.id === regionId)

      if (!attacker || !defender || !region) {
        return state
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

      const factions = state.factions.map((faction) => {
        if (faction.id === attackerId) {
          return recalculateFaction({
            ...faction,
            military: clamp(faction.military - attackerCasualties, 0, 100),
            morale: clamp(faction.morale + (winner === attackerId ? 4 : -6), 0, 100),
          })
        }

        if (faction.id === defenderId) {
          return recalculateFaction({
            ...faction,
            military: clamp(faction.military - defenderCasualties, 0, 100),
            morale: clamp(faction.morale + (winner === defenderId ? 3 : -7), 0, 100),
          })
        }

        return faction
      })

      const regions = state.regions.map((item) =>
        item.id === regionId && regionOwnerChanged ? { ...item, owner: attackerId } : item,
      )
      const relationships = updateRelationshipValue(
        updateRelationshipValue(state.relationships, attackerId, defenderId, -18),
        defenderId,
        attackerId,
        -18,
      )

      const event: BattleEvent = {
        id: createEventId('battle'),
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
          narrative: `${getFactionName(attackerId)}与${getFactionName(defenderId)}在${regionId}爆发战斗，${getFactionName(winner)}取得优势`,
          attacker_remaining_troops: Math.max(0, attacker.military - attackerCasualties),
          defender_remaining_troops: Math.max(0, defender.military - defenderCasualties),
        },
        narration: `${getFactionName(attackerId)}与${getFactionName(defenderId)}在${regionId}爆发战斗，${getFactionName(winner)}取得优势`,
      }

      return {
        factions,
        regions,
        relationships,
        events: pushEventToList(state.events, event),
      }
    })
  },

  addPrivateMessage: (message) => {
    set((state) => ({
      privateMessages: [message, ...state.privateMessages].slice(0, MAX_PRIVATE_MESSAGES),
    }))
  },

  submitSpeech: (submission) => {
    const state = get()

    if (state.epoch.phase !== 'action') {
      return { ok: false, error: '等待行动期开始' }
    }

    const actor = state.selectedFactionId ?? 'starlight'
    const validationError = validateSubmission(submission)

    if (validationError) {
      return { ok: false, error: validationError }
    }

    const rate = tryConsumeRate({
      phaseKey: createPhaseKey(state.epoch),
      playerId: actor,
      mode: submission.mode,
    })

    if (!rate.accepted) {
      return { ok: false, error: '本阶段发送额度已用尽' }
    }

    const now = Date.now()
    const eventId = createEventId(submission.mode)
    const content = submission.content.trim()
    let targets = submission.targets.filter((target) => target !== actor)
    const toneHeat = submission.tone?.heat ?? 0
    const isDeclareWar = isDeclareWarSubmission(submission, content)
    if (isDeclareWar && targets.length === 0) {
      const mentionedTarget = findMentionedFaction(content, actor)
      targets = mentionedTarget ? [mentionedTarget] : []
    }

    const priority = isDeclareWar ? 'P0' : submission.tone?.isAggressive ? 'P1' : 'P2'
    const eventKind: EventKind =
      isDeclareWar
        ? 'declare_war'
        : submission.mode === 'treaty'
          ? submission.treatyKind ?? 'non_aggression'
          : submission.mode === 'military'
            ? 'battle'
            : submission.mode
    const target = targets[0]
    const targetNames = getTargetNames(targets)
    const treatyLabel = submission.treatyKind ? treatyKindLabels[submission.treatyKind] : undefined
    const militaryLabel = submission.military
      ? militaryActionLabels[submission.military.action]
      : undefined
    const narrationByMode: Record<CommandSubmission['mode'], string> = {
      speech: `${getFactionName(actor)}发表公开演讲，预计文化影响 +${estimateCultureGain(content, toneHeat)}`,
      private: `${getFactionName(actor)}向${targetNames}发送加密密谈`,
      treaty: `${getFactionName(actor)}向${targetNames}提出${treatyLabel ?? '条约'}草案`,
      military: `${getFactionName(actor)}下达${militaryLabel ?? '战术'}军令`,
      intel: `${getFactionName(actor)}请求针对${targetNames}的情报`,
    }

    const event: GameEvent = {
      id: eventId,
      createdAt: now,
      epoch: state.epoch.id,
      turn: state.epoch.turn,
      phase: state.epoch.phase,
      priority,
      kind: eventKind,
      actor,
      target,
      payload: {
        origin: 'player_command',
        mode: submission.mode,
        text: content,
        targets,
        treatyKind: submission.treatyKind,
        military: submission.military,
        tone: submission.tone,
        culture_gain: submission.mode === 'speech' ? estimateCultureGain(content, toneHeat) : undefined,
        viaCourier: submission.mode === 'intel' && !canDirectIntel(actor),
      },
      narration: narrationByMode[submission.mode],
    }

    const nextEvents = pushEventToList(state.events, event)
    const betrayalEvent: GameEvent | null =
      toneHeat >= 72
        ? {
            id: createEventId('betrayal'),
            createdAt: now + 1,
            epoch: state.epoch.id,
            turn: state.epoch.turn,
            phase: state.epoch.phase,
            priority: 'P1',
            kind: 'betrayal',
            actor,
            target,
            payload: {
              sourceEventId: eventId,
              provisional: true,
              toneHeat,
            },
            narration: `${getFactionName(actor)}的强硬措辞被记录为潜在背叛倾向`,
          }
        : null

    const privateMessage: PrivateMessage | null =
      submission.mode === 'private' && target
        ? {
            id: createEventId('private_message'),
            createdAt: now,
            epoch: state.epoch.id,
            turn: state.epoch.turn,
            phase: state.epoch.phase,
            from: actor,
            to: target,
            priority,
            subject: `密谈：${getFactionName(target)}`,
            body: content,
            encrypted: true,
            payload: {
              sourceEventId: eventId,
              tone: submission.tone,
            },
          }
        : null

    set((current) => ({
      events: betrayalEvent ? pushEventToList(nextEvents, betrayalEvent) : nextEvents,
      eventsWindow: betrayalEvent ? pushEventToList(nextEvents, betrayalEvent) : nextEvents,
      privateMessages: privateMessage
        ? [privateMessage, ...current.privateMessages].slice(0, MAX_PRIVATE_MESSAGES)
        : current.privateMessages,
    }))

    return { ok: true, eventId }
  },

  _applyPhase: (payload) => {
    const receivedAtMs = Date.now()
    const epoch: Epoch =
      'phase_started_at_ms' in payload
        ? {
            id: payload.epoch,
            turn: payload.turn,
            phase: payload.phase,
            arbitratePhase: payload.arbitrate_phase,
            phaseStartedAt: payload.phase_started_at_ms,
            phaseDurationMs: payload.phase_duration_ms,
          }
        : payload

    set((state) => ({
      epoch,
      currentTurn: epoch,
      currentEpoch: epoch.id,
      currentPhase: epoch.phase,
      phaseStartedAt: epoch.phaseStartedAt,
      isPaused: 'is_paused' in payload && typeof payload.is_paused === 'boolean' ? payload.is_paused : state.isPaused,
    }))

    if ('phase_started_at_ms' in payload) {
      get()._applyServerClockSample(payload.server_time_ms ?? receivedAtMs, receivedAtMs)
    }
  },

  _applyTurnBegin: (payload) => {
    const snapshot = normalizeVisibleSnapshot(payload.visible_snapshot)
    const phase = payload.phase ?? snapshot.epoch?.phase
    const phaseStartedAt = payload.phase_started_at_ms ?? snapshot.epoch?.phaseStartedAt
    const phaseDurationMs = payload.phase_duration_ms ?? snapshot.epoch?.phaseDurationMs

    if (phase && typeof phaseStartedAt === 'number' && typeof phaseDurationMs === 'number') {
      get()._applyPhase({
        room_id: payload.room_id,
        epoch: payload.epoch,
        turn: payload.turn,
        phase,
        arbitrate_phase: payload.arbitrate_phase ?? snapshot.epoch?.arbitratePhase,
        phase_started_at_ms: phaseStartedAt,
        phase_duration_ms: phaseDurationMs,
        server_time_ms: payload.server_time_ms,
      })
    }

    set((state) => ({
      factions: snapshot.factions.length > 0 ? snapshot.factions : state.factions,
      regions: snapshot.regions.length > 0 ? snapshot.regions : state.regions,
      relationships: snapshot.relationships.length > 0 ? snapshot.relationships : state.relationships,
    }))

    useMapStore.getState().advanceScorched(payload.turn)
  },

  _applyEvents: (payload) => {
    const normalized = Array.isArray(payload)
      ? {
          events: compactDefined(payload).map((event) => normalizeGameEvent(event)),
          privateMessages: [],
        }
      : normalizeActionEvents(payload)

    set((state) => ({
      events: pushEventsToList(state.events, normalized.events),
      eventsWindow: pushEventsToList(state.eventsWindow, normalized.events),
      privateMessages:
        normalized.privateMessages.length > 0
          ? pushPrivateMessagesToList(state.privateMessages, normalized.privateMessages)
          : state.privateMessages,
    }))
  },

  handleExplosion: (payload) => {
    const event = normalizeExplosionEvent(payload, get().regions)
    useMapStore.getState().enqueueExplosion(event)

    if (!event.narrative_hint) {
      return
    }

    const state = get()
    const region = state.regions.find(
      (item) => item.id === event.region_id || item.hex_id === event.primary_hex_id,
    )
    const explosionNarration: GameEvent = {
      id: `${event.id}_narration`,
      createdAt: event.created_at_ms ?? Date.now(),
      epoch: event.epoch ?? state.epoch.id,
      turn: event.turn ?? state.epoch.turn,
      phase: state.epoch.phase,
      priority: event.economic_loss_pct >= 0.12 ? 'P1' : 'P2',
      kind: 'narration',
      actor: region?.owner ?? undefined,
      target: undefined,
      payload: {
        source_event_id: event.id,
        region_id: event.region_id ?? null,
        primary_hex_id: event.primary_hex_id,
        affected_hex_ids: event.affected_hex_ids,
        economic_loss_pct: event.economic_loss_pct,
        narrative_hint: event.narrative_hint,
        kind: event.kind,
      },
      narration: `爆炸冲击 ${event.primary_hex_id ?? event.region_id ?? '未知区域'}`,
    }

    set((state) => ({
      events: pushEventToList(state.events, explosionNarration),
      eventsWindow: pushEventToList(state.eventsWindow, explosionNarration),
    }))
  },

  applyScorchedDiff: (payload) => {
    useMapStore.getState().applyScorchedDiff(payload)
  },

  _applyDiplomaticArcs: (payload) => {
    const arcs = Array.isArray(payload) ? compactDefined(payload) : compactDefined(payload.arcs)

    if (arcs.length === 0) {
      return
    }

    set((state) => ({
      diplomaticArcs: settleExpiringVisuals(
        state.diplomaticArcs,
        arcs,
        activeDiplomaticArcTimers,
        MAX_ACTIVE_DIPLOMATIC_ARCS,
        (id) => {
          set((current) => ({
            diplomaticArcs: current.diplomaticArcs.filter((arc) => arc.id !== id),
          }))
        },
      ),
    }))
  },

  _applyRipples: (payload) => {
    const ripples = Array.isArray(payload) ? compactDefined(payload) : compactDefined(payload.ripples)

    if (ripples.length === 0) {
      return
    }

    set((state) => ({
      ripples: settleExpiringVisuals(
        state.ripples,
        ripples,
        activeRippleTimers,
        MAX_ACTIVE_RIPPLES,
        (id) => {
          set((current) => ({
            ripples: current.ripples.filter((ripple) => ripple.id !== id),
          }))
        },
      ),
    }))
  },

  _applyMapDiff: (payload) => {
    const rawPayload: Record<string, unknown> = isRecord(payload) ? payload : {}
    const changes = compactDefined(Array.isArray(payload) ? payload : payload.changes)
      .map((change) => normalizeRegionPatch(change))
      .filter((change): change is MapRegionPatch => change !== null)
    const borderTensionMap = Array.isArray(payload)
      ? {}
      : normalizeBorderTensionMap(rawPayload.border_updates)

    if (changes.length === 0 && Object.keys(borderTensionMap).length === 0) {
      return
    }

    set((state) => ({
      regions:
        changes.length > 0
          ? state.regions.map((region) => {
              const patch = changes.find((change) => change.region_id === region.id || change.id === region.id)
              if (!patch) {
                return region
              }

              const owner = 'new_owner' in patch ? patch.new_owner ?? null : patch.owner ?? region.owner
              return {
                ...region,
                owner,
                resourceValue: patch.resourceValue ?? region.resourceValue,
                developmentLevel:
                  patch.developmentLevel ??
                  (patch.transition === 'conquest' ? 0.3 : region.developmentLevel),
                resistance: patch.resistance ?? (patch.transition === 'conquest' ? 0.5 : region.resistance),
                capturedAtTurn:
                  patch.capturedAtTurn ??
                  (patch.transition === 'conquest' ? state.epoch.turn : region.capturedAtTurn),
                centerLatLng: patch.centerLatLng ?? region.centerLatLng,
                lat: patch.lat !== undefined ? patch.lat : region.lat,
                lng: patch.lng !== undefined ? patch.lng : region.lng,
                hex_id: patch.hex_id !== undefined ? patch.hex_id : region.hex_id,
                elevation: patch.elevation !== undefined ? patch.elevation : region.elevation,
                terrain: patch.terrain ?? region.terrain,
                minGarrison: patch.minGarrison ?? region.minGarrison,
                supplyLines: patch.supplyLines ?? region.supplyLines,
                neighbors: patch.neighbors ?? region.neighbors,
              }
            })
          : state.regions,
      regionTransitionLog:
        changes.length > 0
          ? [
              ...changes.map((change) => ({
                id: `${change.region_id ?? change.id}:${change.new_owner ?? 'none'}:${Date.now()}`,
                region_id: change.region_id ?? change.id ?? '',
                prev_owner: change.prev_owner ?? null,
                new_owner: change.new_owner ?? null,
                transition: change.transition ?? 'conquest',
                animation_params: change.animation_params ?? normalizeAnimationParams(null),
                started_at: Date.now(),
              })),
              ...state.regionTransitionLog,
            ].slice(0, 20)
          : state.regionTransitionLog,
      borderTensionMap:
        Object.keys(borderTensionMap).length > 0
          ? {
              ...state.borderTensionMap,
              ...borderTensionMap,
            }
          : state.borderTensionMap,
    }))
  },

  applyWorldGeometry: (payload) => {
    set(() => ({
      worldGeometry: {
        seed: payload.seed,
        hex_resolution: payload.hex_resolution,
        total_cells: payload.total_cells,
        factions: compactDefined(payload.factions).map((capital) => ({
          id: capital.id,
          capital_hex_id: capital.capital_hex_id,
          capital_lat: capital.capital_lat,
          capital_lng: capital.capital_lng,
        })),
        capitals: compactDefined(payload.factions).map((capital) => ({
          id: capital.id,
          capital_hex_id: capital.capital_hex_id,
          capital_lat: capital.capital_lat,
          capital_lng: capital.capital_lng,
        })),
      },
      regions: compactDefined(payload.cells).map((cell) => ({
        id: cell.id,
        owner: cell.owner,
        resourceValue: cell.resourceValue,
        developmentLevel: cell.developmentLevel,
        elevation: cell.elevation,
        resistance: cell.resistance,
        capturedAtTurn: cell.capturedAtTurn,
        centerLatLng: cell.centerLatLng,
        lat: cell.lat,
        lng: cell.lng,
        hex_id: cell.hex_id,
        terrain: cell.terrain,
        minGarrison: cell.minGarrison,
        supplyLines: cell.supplyLines,
        neighbors: cell.neighbors,
      })),
    }))
  },

  _applyStatsDiff: (payload) => {
    const factionStats = payload.faction_stats ?? []
    const relationshipChanges = payload.relationship_changes ?? []

    if (factionStats.length === 0 && relationshipChanges.length === 0) {
      return
    }

    set((state) => ({
      factions:
        factionStats.length > 0
          ? state.factions.map((faction) => {
              const patch = factionStats.find((item) => item.faction_id === faction.id)
              if (!patch) {
                return faction
              }

              const nextFaction = {
                ...faction,
                military:
                  patch.resulting_military ?? clamp(faction.military + patch.military_delta, 0, 100),
                economy:
                  patch.resulting_economy ?? clamp(faction.economy + patch.economy_delta, 0, 100),
                diplomacy:
                  patch.resulting_diplomacy ??
                  clamp(faction.diplomacy + patch.diplomacy_delta, 0, 100),
                culture:
                  patch.resulting_culture ?? clamp(faction.culture + patch.culture_delta, 0, 100),
                morale: patch.resulting_morale ?? clamp(faction.morale + patch.morale_delta, 0, 100),
              }
              const totalPower =
                patch.resulting_total_power ??
                nextFaction.military +
                  nextFaction.economy +
                  nextFaction.diplomacy +
                  nextFaction.culture +
                  nextFaction.morale

              return {
                ...nextFaction,
                totalPower,
                status: getFactionStatus(totalPower),
              }
            })
          : state.factions,
      relationships:
        relationshipChanges.length > 0
          ? state.relationships.map((relationship) => {
              const patch = relationshipChanges.find(
                (item) =>
                  item.from_faction === relationship.from && item.to_faction === relationship.to,
              )

              if (!patch) {
                return relationship
              }

              const nextValue = clamp(relationship.value + patch.delta, -100, 100)

              return {
                ...relationship,
                value: nextValue,
                status: getRelationshipStatus(nextValue),
                treaties: relationship.treaties,
              }
            })
          : state.relationships,
    }))
  },

  applySnapshot: (payload) => {
    const receivedAtMs = Date.now()
    const payloadRecord = isRecord(payload) ? (payload as Record<string, unknown>) : {}
    const serverTimeMs = typeof payloadRecord.server_time_ms === 'number' ? payloadRecord.server_time_ms : receivedAtMs
    const fullState =
      isRecord(payloadRecord.full_state) ? payloadRecord.full_state : payloadRecord
    const fullStateRecord = isRecord(fullState) ? (fullState as Record<string, unknown>) : {}
    const roomRecord = isRecord(fullStateRecord.room) ? fullStateRecord.room : null
    const room = roomRecord ? normalizeRoomSnapshot(roomRecord) : normalizeRoomSnapshot(fullStateRecord)
    const snapshot = normalizeSnapshotPayload(fullState)
    const aiState = buildAIStateFromStreams(snapshot.events, snapshot.privateMessages)
    const shouldResetVisuals = room.room_id !== '' && room.room_id !== get().currentRoomId

    if (shouldResetVisuals) {
      resetExpiringVisuals()
      epochSummaryStore.getState().reset()
      useMapStore.setState({
        scorchedRegions: new Map(),
        explosionQueue: [],
      })
    }

    set((state) => ({
      currentRoomId: room.room_id || state.currentRoomId,
      roomMode: room.mode,
      roomStatus: room.status,
      roomPlayers: room.players,
      aiFactions: room.ai_factions,
      currentPlayerId:
        roomRecord && typeof roomRecord.current_player_id === 'string'
          ? roomRecord.current_player_id
          : state.currentPlayerId,
      currentTurn: snapshot.currentTurn ?? state.currentTurn,
      epoch: snapshot.currentTurn ?? state.epoch,
      factions: snapshot.factions,
      regions: snapshot.regions,
      relationships: snapshot.relationships,
      treaties: snapshot.treaties,
      events: dedupeAndSortEvents(snapshot.events),
      eventsWindow: dedupeAndSortEvents(snapshot.events),
      privateMessages: dedupeAndSortPrivateMessages(snapshot.privateMessages),
      aiThinkingState: snapshot.aiThinkingState,
      aiThinkingByFaction: aiState.aiThinkingByFaction,
      aiSpeakQueue: aiState.aiSpeakQueue,
      aiReactionByEvent: aiState.aiReactionByEvent,
      lastAIThinking: aiState.lastAIThinking,
      lastAISpeak: aiState.lastAISpeak,
      lastAIReaction: aiState.lastAIReaction,
      borderTensionMap: snapshot.borderTensionMap,
      regionTransitionLog: [],
      aiDiaries: shouldResetVisuals ? emptyAIDiaries() : state.aiDiaries,
      diplomaticArcs: shouldResetVisuals ? [] : state.diplomaticArcs,
      ripples: shouldResetVisuals ? [] : state.ripples,
      worldGeometry: shouldResetVisuals ? null : state.worldGeometry,
      winner: snapshot.winner,
      finalNarration: snapshot.finalNarration,
      settings: snapshot.settings,
      status: 'snapshot_applied',
      currentEpoch: snapshot.currentTurn?.id ?? state.currentEpoch,
      currentPhase: snapshot.currentTurn?.phase ?? state.currentPhase,
      phaseStartedAt: snapshot.currentTurn?.phaseStartedAt ?? state.phaseStartedAt,
    }))

    get()._applyServerClockSample(serverTimeMs, receivedAtMs)
    useUIStore.getState().setLastSyncAt(receivedAtMs)
    useUIStore.getState().setConnectionFailureReason(null)
  },

  applyRoomStarted: (payload) => {
    const receivedAtMs = Date.now()
    const normalized = normalizeRoomStartedPayload(payload)
    const aiState = buildAIStateFromStreams(
      normalized.initialState.events,
      normalized.initialState.privateMessages,
    )
    const shouldResetVisuals = normalized.room.room_id !== '' && normalized.room.room_id !== get().currentRoomId

    if (shouldResetVisuals) {
      resetExpiringVisuals()
      epochSummaryStore.getState().reset()
      useMapStore.setState({
        scorchedRegions: new Map(),
        explosionQueue: [],
      })
    }

    set((state) => ({
      currentRoomId: normalized.room.room_id || state.currentRoomId,
      roomMode: normalized.room.mode,
      roomStatus: normalized.room.status,
      roomPlayers: normalized.room.players,
      aiFactions: normalized.room.ai_factions,
      currentTurn: normalized.initialState.currentTurn ?? state.currentTurn,
      epoch: normalized.initialState.currentTurn ?? state.epoch,
      factions: normalized.initialState.factions,
      regions: normalized.initialState.regions,
      relationships: normalized.initialState.relationships,
      treaties: normalized.initialState.treaties,
      events: dedupeAndSortEvents(normalized.initialState.events),
      eventsWindow: dedupeAndSortEvents(normalized.initialState.events),
      privateMessages: dedupeAndSortPrivateMessages(normalized.initialState.privateMessages),
      aiThinkingState: normalized.initialState.aiThinkingState,
      aiThinkingByFaction: aiState.aiThinkingByFaction,
      aiSpeakQueue: aiState.aiSpeakQueue,
      aiReactionByEvent: aiState.aiReactionByEvent,
      lastAIThinking: aiState.lastAIThinking,
      lastAISpeak: aiState.lastAISpeak,
      lastAIReaction: aiState.lastAIReaction,
      borderTensionMap: normalized.initialState.borderTensionMap,
      regionTransitionLog: [],
      aiDiaries: shouldResetVisuals ? emptyAIDiaries() : state.aiDiaries,
      diplomaticArcs: shouldResetVisuals ? [] : state.diplomaticArcs,
      ripples: shouldResetVisuals ? [] : state.ripples,
      worldGeometry: shouldResetVisuals ? null : state.worldGeometry,
      winner: normalized.initialState.winner,
      finalNarration: normalized.initialState.finalNarration,
      settings: normalized.settings,
      status: 'in_progress',
      currentEpoch: normalized.initialState.currentTurn?.id ?? state.currentEpoch,
      currentPhase: normalized.initialState.currentTurn?.phase ?? state.currentPhase,
      phaseStartedAt: normalized.initialState.currentTurn?.phaseStartedAt ?? state.phaseStartedAt,
    }))

    get()._applyServerClockSample(receivedAtMs, receivedAtMs)
    useUIStore.getState().setLastSyncAt(receivedAtMs)
    useUIStore.getState().setConnectionFailureReason(null)
  },

  _applySnapshot: (payload) => {
    get().applySnapshot(payload)
  },

  _applyRoomStarted: (payload) => {
    get().applyRoomStarted(payload)
  },

  _applyRoomCreated: (payload) => {
    set((state) => ({
      currentRoomId: payload.room_id,
      roomMode: payload.mode,
      roomStatus: 'lobby',
      roomPlayers: state.roomPlayers,
      aiFactions: state.aiFactions,
    }))
  },

  _applyServerClockSample: (serverTimeMs, clientTimeMs = Date.now()) => {
    set((state) => {
      const offset = serverTimeMs - clientTimeMs
      const nextOffset =
        state.serverClockSampleAtMs > 0
          ? state.serverClockOffsetMs * 0.7 + offset * 0.3
          : offset

      return {
        serverClockOffsetMs: nextOffset,
        serverClockSampleAtMs: clientTimeMs,
      }
    })
  },

  _applyAIDiaries: ({ faction_id, entries }) => {
    set((state) => ({
      aiDiaries: {
        ...state.aiDiaries,
        [faction_id]: entries.map((entry) => ({
          ...entry,
          triggers: [...entry.triggers],
        })),
      },
    }))
  },

  _applyAIThinking: (payload) => {
    const roomId = payload.room_id ?? get().currentRoomId ?? ''
    const thinking: AIThinkingState = {
      progress: clamp(payload.progress, 0, 1),
      phase: payload.phase ?? get().epoch.phase,
      model: payload.model ?? null,
      elapsed_ms: 0,
      fallback: false,
      factionId: payload.faction_id,
      roomId,
      receivedAtMs: Date.now(),
    }

    set((state) => ({
      aiThinkingState: {
        progress: thinking.progress,
        phase: thinking.phase,
        model: thinking.model,
        elapsed_ms: thinking.elapsed_ms,
        fallback: thinking.fallback,
      },
      aiThinkingByFaction: new Map(state.aiThinkingByFaction).set(payload.faction_id, thinking),
      lastAIThinking: thinking,
    }))
  },

  _applyAISpeak: ({ room_id, event, private_message }) => {
    const speak = normalizeAISpeakEntry(event, private_message)
    if (!speak) {
      return
    }

    set((state) => {
      const nextQueue = [speak, ...state.aiSpeakQueue].slice(0, MAX_AI_SPEAK_QUEUE)
      return {
        aiSpeakQueue: nextQueue,
        lastAISpeak: speak,
        events: event.kind === 'narration' || speak.kind === 'private' || speak.kind === 'public'
          ? pushEventToList(state.events, event)
          : state.events,
        privateMessages: private_message
          ? pushPrivateMessagesToList(state.privateMessages, [private_message])
          : state.privateMessages,
        currentRoomId: state.currentRoomId ?? room_id,
      }
    })
  },

  _applyAIReaction: ({ room_id, event, faction_id, reaction, target_faction }) => {
    const payload = isRecord(event.payload) ? event.payload : {}
    const sourceEventId = getEventSourceId(event)
    if (!sourceEventId) {
      return
    }

    const normalizedReaction: AIReaction = {
      id: event.id,
      eventId: sourceEventId,
      factionId: faction_id,
      targetFactionId: target_faction ?? (event.target ?? null),
      reaction: reaction || event.narration || (typeof payload.label === 'string' ? payload.label : ''),
      event,
      createdAt: event.createdAt,
    }

    set((state) => {
      const existing = state.aiReactionByEvent.get(sourceEventId) ?? []
      const nextList = [normalizedReaction, ...existing].slice(0, MAX_AI_REACTIONS_PER_EVENT)
      const nextMap = new Map(state.aiReactionByEvent)
      nextMap.set(sourceEventId, nextList)

      return {
        aiReactionByEvent: nextMap,
        lastAIReaction: normalizedReaction,
        events: pushEventToList(state.events, event),
        currentRoomId: state.currentRoomId ?? room_id,
      }
    })
  },

  togglePause: () => {
    set((state) => ({ isPaused: !state.isPaused }))
  },

  selectFaction: (selectedFactionId) => {
    set((state) => {
      const nextPlayers =
        state.currentPlayerId && state.roomPlayers.length > 0
          ? updateRoomPlayer(state.roomPlayers, state.currentPlayerId, {
              faction_id: selectedFactionId,
              ready: false,
            })
          : state.roomPlayers

      return {
        selectedFactionId,
        roomPlayers: nextPlayers,
      }
    })
  },

  clearFaction: () => {
    set((state) => ({
      selectedFactionId: null,
      roomPlayers:
        state.currentPlayerId && state.roomPlayers.length > 0
          ? updateRoomPlayer(state.roomPlayers, state.currentPlayerId, {
              faction_id: null,
              ready: false,
            })
          : state.roomPlayers,
    }))
  },

  hasDiariesRevealed: () => {
    const state = get()
    return state.roomStatus === 'finished' || Object.keys(state.aiDiaries).length > 0
  },

  _applyRoomJoined: (payload) => {
    const snapshot = payload as Record<string, unknown>
    const room = snapshot.room as
      | {
          id?: string
          mode?: RoomMode
          status?: string
          players?: RoomPlayerSnapshot[]
          ai_factions?: FactionId[]
        }
      | undefined
    const currentPlayerId =
      typeof snapshot.current_player_id === 'string' ? snapshot.current_player_id : null
    const roomId = typeof room?.id === 'string' ? room.id : null
    const currentRoomId = get().currentRoomId
    const shouldResetVisuals = roomId !== null && roomId !== currentRoomId
    if (shouldResetVisuals) {
      resetExpiringVisuals()
      useMapStore.setState({
        scorchedRegions: new Map(),
        explosionQueue: [],
      })
    }

    if (!room) {
      return
    }

    set((state) => ({
      currentRoomId: roomId ?? state.currentRoomId,
      currentPlayerId,
      roomMode: room.mode ?? state.roomMode,
      roomStatus: room.status ?? state.roomStatus,
      roomPlayers: Array.isArray(room.players) ? room.players.map(normalizeRoomPlayer) : state.roomPlayers,
      aiFactions: Array.isArray(room.ai_factions) ? room.ai_factions : state.aiFactions,
      aiDiaries:
        shouldResetVisuals ? emptyAIDiaries() : state.aiDiaries,
      diplomaticArcs: shouldResetVisuals ? [] : state.diplomaticArcs,
      ripples: shouldResetVisuals ? [] : state.ripples,
    }))
  },

  _applyRoomSnapshot: (payload) => {
    const shouldResetVisuals = payload.room_id !== get().currentRoomId
    if (shouldResetVisuals) {
      resetExpiringVisuals()
    }

    set((state) => ({
      currentRoomId: payload.room_id,
      roomMode: payload.mode,
      roomStatus: payload.status,
      roomPlayers: payload.players.map(normalizeRoomPlayer),
      aiFactions: payload.ai_factions,
      settings: payload.settings ?? state.settings,
      aiDiaries:
        shouldResetVisuals ? emptyAIDiaries() : state.aiDiaries,
      aiThinkingByFaction: shouldResetVisuals ? new Map() : state.aiThinkingByFaction,
      aiSpeakQueue: shouldResetVisuals ? [] : state.aiSpeakQueue,
      aiReactionByEvent: shouldResetVisuals ? new Map() : state.aiReactionByEvent,
      lastAIThinking: shouldResetVisuals ? null : state.lastAIThinking,
      lastAISpeak: shouldResetVisuals ? null : state.lastAISpeak,
      lastAIReaction: shouldResetVisuals ? null : state.lastAIReaction,
      diplomaticArcs: shouldResetVisuals ? [] : state.diplomaticArcs,
      ripples: shouldResetVisuals ? [] : state.ripples,
    }))
  },

  _applyPlayerTakeover: (payload) => {
    set((state) => ({
      currentRoomId: state.currentRoomId ?? payload.room_id,
      roomPlayers: updateRoomPlayer(state.roomPlayers, payload.player_id, {
        ai_takeover: true,
        connected: false,
      }),
    }))
  },

  _applyPlayerResume: (payload) => {
    set((state) => ({
      currentRoomId: state.currentRoomId ?? payload.room_id,
      roomPlayers: updateRoomPlayer(state.roomPlayers, payload.player_id, {
        ai_takeover: false,
        connected: true,
      }),
    }))
  },

  _applyOpeningContent: (payload) => {
    set({ openingContent: payload })
  },

  _applyRoomFinished: (payload) => {
    set({
      currentRoomId: payload.room_id,
      roomStatus: 'finished',
      winner: payload.winner,
      finalNarration: payload.final_narration,
    })
  },
}))

export const gameStoreApi = {
  getState: useGameStore.getState,
  setState: useGameStore.setState,
  subscribe: useGameStore.subscribe,
}

export const subscribe = useGameStore.subscribe
