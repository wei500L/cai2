import type { CommandMode, MilitaryAction, ToneAnalysis } from '@/features/commandTerminal/types'
import type {
  ArbitratePhase,
  FactionId,
  GameEvent,
  GamePhase,
  MapRegion,
  MockGameWorldState,
  PrivateMessage,
  Treaty,
  TreatyKind,
} from '@/mock/types'

export type ProtocolVersion = 1
export type RoomMode = 'solo_1v7' | 'multi_4v4'
export type IntelKind = 'spy' | 'interrogate' | 'intercept'

export type Envelope<T extends string, P> = {
  v: ProtocolVersion
  id: string
  t: T
  ts: number
  seq: number
  p: P
}

export type PhasePayload = {
  room_id: string
  epoch: number
  turn: number
  phase: GamePhase
  arbitrate_phase?: ArbitratePhase
  phase_started_at_ms: number
  phase_duration_ms: number
  server_time_ms?: number
  is_paused?: boolean
}

export type TurnBeginPayload = {
  room_id: string
  epoch: number
  turn: number
  phase?: GamePhase
  arbitrate_phase?: ArbitratePhase | null
  phase_started_at_ms?: number
  phase_duration_ms?: number
  server_time_ms?: number
  visible_snapshot: Partial<MockGameWorldState>
}

export type ReconnectRoomPlayer = {
  id: string
  display_name: string
  faction_id: FactionId | null
  connected: boolean
  ready: boolean
  ai_takeover: boolean
}

export type ReconnectRoomState = {
  id: string
  status: string
  mode: RoomMode
  max_players: number
  players: ReconnectRoomPlayer[]
  ai_factions?: FactionId[]
  current_player_id?: string
}

export type ReconnectEpochTurn = {
  epoch: number
  turn: number
  phase: GamePhase
  arbitrate_phase: ArbitratePhase | null
  phase_started_at_ms: number
  phase_duration_ms: number
}

export type ReconnectAIThinkingState = {
  progress: number
  phase: string
  model: string | null
  elapsed_ms: number
}

export type BorderTensionEntry = {
  between: [FactionId, FactionId]
  tension: number
  visual_state: 'calm' | 'watch' | 'tense' | 'critical' | 'hostile_sparking' | 'war_frontline'
}

export type ReconnectMessageRecord = {
  id: string
  room_id: string
  epoch: number
  turn: number
  phase: GamePhase
  from_faction: FactionId
  to_factions: FactionId[]
  visibility: {
    scope: string
    faction_ids: FactionId[]
  }
  content: string
  created_at_ms: number
  kind?: 'private' | 'public'
}

export type ReconnectFullState = {
  room: ReconnectRoomState
  current_turn: ReconnectEpochTurn | null
  factions: MockGameWorldState['factions']
  regions: MapRegion[]
  relationships: MockGameWorldState['relationships']
  treaties: Treaty[]
  recent_events: GameEvent[]
  recent_messages: ReconnectMessageRecord[]
  ai_thinking_state: ReconnectAIThinkingState | null
  border_tension: BorderTensionEntry[]
  winner: FactionId | null
  final_narration: string | null
}

export type MapRegionPatch = Partial<Omit<MapRegion, 'id'>> & {
  id?: string
  region_id?: string
  prev_owner?: FactionId | null
  new_owner?: FactionId | null
  transition?: 'conquest' | 'cede' | 'negotiated' | 'abandoned'
  animation_params?: {
    direction: string
    speed: number
    particles: number
  }
}

export type MapDiffPayload = {
  room_id: string
  epoch: number
  turn: number
  changes: MapRegionPatch[]
  border_updates: BorderTensionEntry[]
}

export type FactionStatsPatch = {
  faction_id: FactionId
  military_delta: number
  economy_delta: number
  diplomacy_delta: number
  culture_delta: number
  morale_delta: number
  resulting_military?: number
  resulting_economy?: number
  resulting_diplomacy?: number
  resulting_culture?: number
  resulting_morale?: number
  resulting_total_power?: number
  crisis?: boolean
  reason?: string | null
}

export type RelationshipPatch = {
  from_faction: FactionId
  to_faction: FactionId
  delta: number
  reason: string
}

export type StatsDiffPayload = {
  room_id: string
  epoch: number
  turn: number
  faction_stats: FactionStatsPatch[]
  relationship_changes: RelationshipPatch[]
}

export type EventBundlePayload = {
  room_id: string
  events: GameEvent[]
  private_messages?: PrivateMessage[]
}

export type DiaryEntry = {
  faction_id: FactionId
  epoch: number
  turn: number
  internal_thought: string
  emotion: string
  triggers: string[]
  created_at_ms: number
}

export type ActionEventPayload = {
  room_id: string
  event: GameEvent
  private_message?: PrivateMessage
}

export type ConnAuthMessage = Envelope<'conn.auth', {
  token: string
  client_version: string
}>
export type ConnPingMessage = Envelope<'conn.ping', { client_ts: number }>
export type ConnAuthOkMessage = Envelope<'conn.auth.ok', {
  player_id: string
  display_name: string
  server_time_ms: number
}>
export type ConnAuthFailMessage = Envelope<'conn.auth.fail', { reason: string }>
export type ConnPongMessage = Envelope<'conn.pong', { server_time_ms?: number; server_ts?: number }>
export type ConnKickMessage = Envelope<'conn.kick', { reason: string }>

export type RoomCreateMessage = Envelope<'room.create', {
  mode: RoomMode
  display_name: string
  seed?: number
}>
export type RoomJoinMessage = Envelope<'room.join', {
  room_id: string
  display_name: string
}>
export type RoomLeaveMessage = Envelope<'room.leave', { room_id: string }>
export type RoomSelectFactionMessage = Envelope<'room.select_faction', {
  room_id: string
  faction_id: FactionId
}>
export type RoomReadyMessage = Envelope<'room.ready', {
  room_id: string
  ready: boolean
}>
export type RoomCreatedMessage = Envelope<'room.created', {
  room_id: string
  mode: RoomMode
}>
export type RoomJoinedMessage = Envelope<'room.joined', {
  room_id: string
  room_snapshot: Record<string, unknown>
}>
export type RoomPlayerSnapshot = {
  player_id: string
  display_name: string
  faction_id: FactionId | null
  connected: boolean
  ready: boolean
  ai_takeover: boolean
}
export type RoomSnapshotMessage = Envelope<'room.snapshot', {
  room_id: string
  mode: RoomMode
  status: string
  players: RoomPlayerSnapshot[]
  ai_factions: FactionId[]
}>
export type RoomPlayerJoinMessage = Envelope<'room.player_join', {
  room_id: string
  player_id: string
  display_name: string
  faction_id?: FactionId
}>
export type RoomPlayerLeaveMessage = Envelope<'room.player_leave', {
  room_id: string
  player_id: string
}>
export type RoomPlayerTakeoverMessage = Envelope<'room.player_takeover', {
  room_id: string
  player_id: string
  faction_id: FactionId
  reason: 'disconnected_30s' | 'manual_leave'
}>
export type RoomPlayerResumeMessage = Envelope<'room.player_resume', {
  room_id: string
  player_id: string
  faction_id: FactionId
}>
export type RoomStartMessage = Envelope<'room.start', {
  room_id: string
  initial_state: Partial<MockGameWorldState> & {
    current_turn?: ReconnectEpochTurn | null
  }
}>
export type RoomFinishedPayload = {
  room_id: string
  winner: FactionId | null
  final_narration: string
  replay_available: boolean
}
export type RoomFinishedMessage = Envelope<'room.finished', RoomFinishedPayload>

export type ActionMetadata = {
  player_faction?: FactionId
  tone?: Pick<ToneAnalysis, 'heat' | 'label' | 'isAggressive'>
  mode?: CommandMode
  [key: string]: unknown
}

export type ActionSpeakMessage = Envelope<'action.speak', {
  room_id: string
  mode: 'speech'
  content: string
  targets: FactionId[]
  metadata?: ActionMetadata
}>
export type ActionPrivateSubmitMessage = Envelope<'action.private', {
  room_id: string
  target_faction: FactionId
  content: string
  metadata?: ActionMetadata
}>
export type ActionTreatyMessage = Envelope<'action.treaty', {
  room_id: string
  treaty_kind: TreatyKind
  target_factions: FactionId[]
  proposal_text: string
  metadata?: ActionMetadata
}>
export type ActionMilitaryMessage = Envelope<'action.military', {
  room_id: string
  source_region: string
  target_region: string
  movement: MilitaryAction
  orders_text: string
  unit_id?: string
  troops?: number
  metadata?: ActionMetadata
}>
export type ActionIntelMessage = Envelope<'action.intel', {
  room_id: string
  target_faction: FactionId
  intel_kind: IntelKind
  brief: string
  metadata?: ActionMetadata
}>
export type ActionLockMessage = Envelope<'action.lock', { room_id: string }>
export type ActionBroadcastMessage = Envelope<'action.broadcast', {
  room_id: string
  event: GameEvent
}>
export type ActionPrivateMessage = Envelope<'action.private', ActionEventPayload>
export type ActionRejectedMessage = Envelope<'action.rejected', {
  room_id: string
  request_id: string
  reason: string
  error_code: string
}>

export type PhaseChangeMessage = Envelope<'phase.change', PhasePayload>
export type TurnBeginMessage = Envelope<'turn.begin', TurnBeginPayload>
export type ResolveEventsMessage = Envelope<'resolve.events', EventBundlePayload & {
  epoch: number
  turn: number
}>
export type ResolveMapDiffMessage = Envelope<'resolve.map_diff', MapDiffPayload>
export type ResolveStatsDiffMessage = Envelope<'resolve.stats_diff', StatsDiffPayload>

export type AIThinkingMessage = Envelope<'ai.thinking', {
  room_id: string
  faction_id: FactionId
  progress: number
}>
export type AISpeakMessage = Envelope<'ai.speak', ActionEventPayload>
export type AIReactionMessage = Envelope<'ai.reaction', ActionEventPayload & {
  faction_id: FactionId
  reaction: string
  target_faction?: FactionId
}>
export type ReplayAIDiaryRevealPayload = {
  room_id: string
  faction_id: FactionId
  entries: DiaryEntry[]
}
export type ReplayAIDiaryRevealMessage = Envelope<'replay.ai_diary_reveal', ReplayAIDiaryRevealPayload>

export type PanoramaOpenMessage = Envelope<'panorama.open', {
  room_id: string
  panorama_id: string
  title: string
  event_ids: string[]
}>
export type PanoramaUpdateMessage = Envelope<'panorama.update', {
  room_id: string
  panorama_id: string
  progress: number
  highlights: string[]
}>
export type PanoramaCloseMessage = Envelope<'panorama.close', {
  room_id: string
  panorama_id: string
}>

export type ReconnectRequestMessage = Envelope<'reconnect.request', {
  room_id: string
  player_id: string
  last_seq: number
  session_token: string
}>
export type ReconnectCatchupMessage = Envelope<'reconnect.catchup', {
  room_id: string
  from_seq: number
  to_seq: number
  server_time_ms: number
  messages: Envelope<string, Record<string, unknown>>[]
}>
export type ReconnectSnapshotMessage = Envelope<'reconnect.snapshot', {
  room_id: string
  server_time_ms: number
  full_state: ReconnectFullState
  seq: number
}>
export type ErrorMessage = Envelope<'error.message', {
  reason: string
  error_code: string
  request_id?: string
}>

export type IncomingMessage =
  | ConnAuthOkMessage
  | ConnAuthFailMessage
  | ConnPongMessage
  | ConnKickMessage
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomPlayerJoinMessage
  | RoomPlayerLeaveMessage
  | RoomSnapshotMessage
  | RoomPlayerTakeoverMessage
  | RoomPlayerResumeMessage
  | RoomStartMessage
  | RoomFinishedMessage
  | PhaseChangeMessage
  | TurnBeginMessage
  | ActionBroadcastMessage
  | ActionPrivateMessage
  | ActionRejectedMessage
  | ResolveEventsMessage
  | ResolveMapDiffMessage
  | ResolveStatsDiffMessage
  | AIThinkingMessage
  | AISpeakMessage
  | AIReactionMessage
  | ReplayAIDiaryRevealMessage
  | PanoramaOpenMessage
  | PanoramaUpdateMessage
  | PanoramaCloseMessage
  | ReconnectCatchupMessage
  | ReconnectSnapshotMessage
  | ErrorMessage

export type OutgoingMessage =
  | ConnAuthMessage
  | ConnPingMessage
  | RoomCreateMessage
  | RoomJoinMessage
  | RoomLeaveMessage
  | RoomSelectFactionMessage
  | RoomReadyMessage
  | ActionSpeakMessage
  | ActionPrivateSubmitMessage
  | ActionTreatyMessage
  | ActionMilitaryMessage
  | ActionIntelMessage
  | ActionLockMessage
  | ReconnectRequestMessage

export type MessageType = IncomingMessage['t'] | OutgoingMessage['t']
