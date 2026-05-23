import { ENV } from '@/app/env'
import { factionById, type FactionId } from '@/mock/factions'
import type {
  AIInnerThought,
  DeceptionStat,
  FactionCurve,
  KeyMoment,
  RelationshipSnapshot,
  ReplayData,
  ReplayTimelineNode,
} from '@/mock/replay'
import type { EventKind, EventPriority, GameEvent, GamePhase, PrivateMessage } from '@/mock/types'

const REPLAY_FETCH_TIMEOUT_MS = 10_000
const eventKinds = new Set<EventKind>([
  'speech',
  'private',
  'declare_war',
  'alliance',
  'trade',
  'non_aggression',
  'ceasefire',
  'betrayal',
  'battle',
  'economy',
  'intel',
  'phase_change',
  'ai_thinking',
  'ai_reaction',
  'narration',
])
const priorities = new Set<EventPriority>(['P0', 'P1', 'P2'])
const phases = new Set<GamePhase>(['observe', 'action', 'resolve', 'arbitrate'])

export type ReplayDTO = {
  room_id: string
  generated_at_ms: number
  mode: string
  total_epochs: number
  total_turns: number
  timeline: Array<Record<string, unknown>>
  public_events: Array<Record<string, unknown>>
  private_messages: Array<Record<string, unknown>>
  ai_internal_thoughts: Array<Record<string, unknown>>
  faction_curves: Array<Record<string, unknown>>
  relationship_snapshots: Array<Record<string, unknown>>
  key_moments: Array<Record<string, unknown>>
  famous_quotes: Array<Record<string, unknown>>
  betrayal_events: Array<Record<string, unknown>>
  deception_stats: Array<Record<string, unknown>>
  final_factions: Array<Record<string, unknown>>
  winner: FactionId | null
  final_narration: string
}

export async function fetchReplay(roomId: string): Promise<ReplayDTO> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REPLAY_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${ENV.backendRestBase}/rooms/${encodeURIComponent(roomId)}/replay`,
      { signal: controller.signal },
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json() as ReplayDTO
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function loadReplay(roomId: string): Promise<ReplayData> {
  try {
    return normalizeReplayDto(await fetchReplay(roomId))
  } catch (error) {
    throw new Error(`真实复盘读取失败。${formatFetchError(error)}`)
  }
}

export function normalizeReplayDto(dto: ReplayDTO): ReplayData {
  const events = dto.public_events.map(normalizeEvent)
  const timeline = normalizeTimeline(dto.timeline, events)

  return {
    timeline,
    events,
    privateMessages: dto.private_messages.map(normalizePrivateMessage),
    aiInnerThoughts: dto.ai_internal_thoughts.map(normalizeAIThought),
    factionCurves: dto.faction_curves.map(normalizeFactionCurve),
    relationshipSnapshots: dto.relationship_snapshots.map(normalizeRelationshipSnapshot),
    deceptionStats: dto.deception_stats.map(normalizeDeceptionStat),
    keyMoments: dto.key_moments.map((moment, index) => normalizeKeyMoment(moment, index)),
  }
}

function normalizeTimeline(rawTimeline: Array<Record<string, unknown>>, events: GameEvent[]): ReplayTimelineNode[] {
  const timeline = rawTimeline.map((entry) => ({
    epoch: numberValue(entry.epoch, 1),
    turn: numberValue(entry.turn, 1),
    phase: phaseValue(entry.phase, 'observe'),
    keyEventIds: arrayValue(entry.key_event_ids).filter(isString),
  }))

  if (timeline.length > 0) {
    return timeline
  }

  if (events.length > 0) {
    const first = events[0]
    return [{ epoch: first.epoch, turn: first.turn, phase: first.phase, keyEventIds: [first.id] }]
  }

  return [{ epoch: 1, turn: 1, phase: 'observe', keyEventIds: [] }]
}

function normalizeEvent(raw: Record<string, unknown>, index: number): GameEvent {
  const actor = factionValue(raw.actor_faction ?? raw.actor)
  const target = factionValue(raw.target_faction ?? raw.target)

  return {
    id: stringValue(raw.id, `replay_event_${index}`),
    seq: numberValue(raw.seq, undefined),
    createdAt: numberValue(raw.created_at_ms ?? raw.createdAt, 0),
    epoch: numberValue(raw.epoch, 1),
    turn: numberValue(raw.turn, 1),
    phase: phaseValue(raw.phase, 'resolve'),
    priority: priorityValue(raw.priority, 'P2'),
    kind: eventKindValue(raw.kind, 'narration'),
    actor,
    target,
    payload: recordValue(raw.payload),
    narration: stringValue(raw.narration, '未命名事件'),
  }
}

function normalizePrivateMessage(raw: Record<string, unknown>, index: number): PrivateMessage {
  const content = stringValue(raw.content ?? raw.body, '密谈内容未记录')
  const visibility = recordValue(raw.visibility)
  const scope = stringValue(visibility.scope, '')
  const toFactions = arrayValue(raw.to_factions)
  const from = factionValue(raw.from_faction ?? raw.from) ?? 'starlight'
  const to = factionValue(toFactions[0] ?? raw.to) ?? from

  return {
    id: stringValue(raw.id, `replay_private_${index}`),
    createdAt: numberValue(raw.created_at_ms ?? raw.createdAt, 0),
    epoch: numberValue(raw.epoch, 1),
    turn: numberValue(raw.turn, 1),
    phase: phaseValue(raw.phase, 'action'),
    from,
    to,
    priority: priorityValue(raw.priority, 'P1'),
    subject: stringValue(raw.subject, content.slice(0, 24) || '密谈记录'),
    body: content,
    encrypted: raw.encrypted === true || scope !== 'public',
    payload: {
      ...recordValue(raw.payload),
      visibility,
    },
  }
}

function normalizeAIThought(raw: Record<string, unknown>): AIInnerThought {
  return {
    factionId: factionValue(raw.faction_id) ?? 'starlight',
    epoch: numberValue(raw.epoch, 1),
    turn: numberValue(raw.turn, 1),
    text: stringValue(raw.text ?? raw.internal_thought, ''),
  }
}

function normalizeFactionCurve(raw: Record<string, unknown>): FactionCurve {
  return {
    factionId: factionValue(raw.faction_id) ?? 'starlight',
    points: arrayValue(raw.points).map((point) => {
      const record = recordValue(point)
      return {
        epoch: numberValue(record.epoch, 1),
        turn: numberValue(record.turn, 1),
        totalPower: numberValue(record.total_power ?? record.totalPower, 0),
      }
    }),
  }
}

function normalizeRelationshipSnapshot(raw: Record<string, unknown>): RelationshipSnapshot {
  return {
    epoch: numberValue(raw.epoch, 1),
    matrix: recordValue(raw.matrix) as RelationshipSnapshot['matrix'],
  }
}

function normalizeDeceptionStat(raw: Record<string, unknown>): DeceptionStat {
  const rawRate = numberValue(raw.success_rate ?? raw.successRate, 0)
  return {
    factionId: factionValue(raw.faction_id) ?? 'starlight',
    lies: numberValue(raw.lies, 0),
    exposed: numberValue(raw.exposed, 0),
    successRate: Math.round(rawRate <= 1 ? rawRate * 100 : rawRate),
  }
}

function normalizeKeyMoment(raw: Record<string, unknown>, index: number): KeyMoment {
  const event = normalizeEvent(raw, index)
  return {
    id: `moment_${event.id}`,
    epoch: event.epoch,
    turn: event.turn,
    title: `名场面 ${String(index + 1).padStart(2, '0')}`,
    caption: event.narration,
    eventId: event.id,
    factionId: event.actor,
  }
}

function factionValue(value: unknown): FactionId | undefined {
  return typeof value === 'string' && value in factionById ? value as FactionId : undefined
}

function phaseValue(value: unknown, fallback: GamePhase): GamePhase {
  return typeof value === 'string' && phases.has(value as GamePhase) ? value as GamePhase : fallback
}

function priorityValue(value: unknown, fallback: EventPriority): EventPriority {
  return typeof value === 'string' && priorities.has(value as EventPriority)
    ? value as EventPriority
    : fallback
}

function eventKindValue(value: unknown, fallback: EventKind): EventKind {
  return typeof value === 'string' && eventKinds.has(value as EventKind)
    ? value as EventKind
    : fallback
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function numberValue(value: unknown, fallback: number): number
function numberValue(value: unknown, fallback: undefined): number | undefined
function numberValue(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatFetchError(error: unknown) {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
    return '请求超时。'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return '未知错误。'
}
