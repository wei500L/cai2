import { AI_PRIVATE_TEMPLATES, AI_SPEECH_TEMPLATES } from '@/mock/aiTemplates'
import { factionById } from '@/mock/factions'
import type { FactionId } from '@/types/faction'
import { TURNS_PER_EPOCH } from '@/mock/gameState'
import type {
  EventKind,
  EventPriority,
  FactionState,
  GameEvent,
  GamePhase,
  MockGameWorldState,
  PrivateMessage,
  RelationshipStatus,
} from '@/types'
import type {
  AIInnerThought,
  DeceptionStat,
  FactionCurve,
  KeyMoment,
  RelationshipMatrix,
  RelationshipSnapshot,
  ReplayData,
  ReplayTimelineNode,
} from '@/types/replay'
import { factionIds } from '@/components/hudTheme'

type ReplaySourceState = MockGameWorldState & { selectedFactionId?: FactionId | null }

export type {
  AIInnerThought,
  DeceptionStat,
  FactionCurve,
  KeyMoment,
  RelationshipMatrix,
  RelationshipSnapshot,
  ReplayData,
  ReplayTimelineNode,
} from '@/types/replay'

type ReplayEventCategory = 'declare_war' | 'elimination' | 'betrayal' | 'alliance'

const keyKinds = new Set<EventKind>([
  'declare_war',
  'battle',
  'invasion',
  'siege',
  'bombing',
  'naval_assault',
  'uprising',
  'nuclear_strike',
  'betrayal',
  'alliance',
  'trade',
  'non_aggression',
  'ceasefire',
  'ai_reaction',
])

const syntheticCategories: ReplayEventCategory[] = [
  'declare_war',
  'elimination',
  'betrayal',
  'alliance',
]

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickBySeed<T>(items: readonly T[], seed: string) {
  return items[hashText(seed) % items.length]
}

function sortByTime<T extends { epoch: number; turn: number; createdAt?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.epoch !== b.epoch) {
      return a.epoch - b.epoch
    }

    if (a.turn !== b.turn) {
      return a.turn - b.turn
    }

    return (a.createdAt ?? 0) - (b.createdAt ?? 0)
  })
}

function getTargetFaction(actor: FactionId, seed: string) {
  const candidates = factionIds.filter((id) => id !== actor)
  return pickBySeed(candidates, seed)
}

function getEventCategory(event: GameEvent): ReplayEventCategory | null {
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

function createSyntheticEvent(
  category: ReplayEventCategory,
  index: number,
  baseEpoch: number,
  baseTurn: number,
): GameEvent {
  const actor = factionIds[(index * 2) % factionIds.length]
  const target = getTargetFaction(actor, `${category}:${index}`)
  const labels: Record<ReplayEventCategory, { kind: EventKind; title: string; priority: EventPriority }> = {
    declare_war: {
      kind: 'declare_war',
      title: `${factionById[actor].name}向${factionById[target].name}宣战，公开条约线断裂`,
      priority: 'P0',
    },
    elimination: {
      kind: 'battle',
      title: `${factionById[target].name}旗帜熄灭，灭国记录被揭示`,
      priority: 'P0',
    },
    betrayal: {
      kind: 'betrayal',
      title: `${factionById[actor].name}撕毁密约，背叛链条曝光`,
      priority: 'P1',
    },
    alliance: {
      kind: 'alliance',
      title: `${factionById[actor].name}与${factionById[target].name}暗线结盟`,
      priority: 'P1',
    },
  }
  const label = labels[category]

  return {
    id: `replay_synthetic_${category}`,
    createdAt: Date.now() + index,
    epoch: Math.max(1, baseEpoch),
    turn: Math.max(1, baseTurn + index),
    phase: index % 2 === 0 ? 'resolve' : 'action',
    priority: label.priority,
    kind: label.kind,
    actor,
    target,
    payload: {
      replaySynthetic: true,
      category,
      eliminatedFaction: category === 'elimination' ? target : undefined,
    },
    narration: label.title,
  }
}

function ensureRevealEvents(events: GameEvent[], state: MockGameWorldState) {
  const categories = new Set(events.map(getEventCategory).filter(Boolean))
  const baseEpoch = Math.max(1, state.epoch.id)
  const baseTurn = Math.max(1, state.epoch.turn)
  const additions = syntheticCategories
    .filter((category) => !categories.has(category))
    .map((category, index) => createSyntheticEvent(category, index, baseEpoch, baseTurn))

  return sortByTime([...events, ...additions])
}

function buildTimeline(events: GameEvent[], state: MockGameWorldState): ReplayTimelineNode[] {
  const keyEvents = events.filter(
    (event) => event.priority === 'P0' || event.priority === 'P1' || keyKinds.has(event.kind),
  )
  const grouped = new Map<string, ReplayTimelineNode>()

  for (const event of keyEvents) {
    const key = `${event.epoch}:${event.turn}:${event.phase}`
    const existing = grouped.get(key)
    if (existing) {
      existing.keyEventIds.push(event.id)
    } else {
      grouped.set(key, {
        epoch: event.epoch,
        turn: event.turn,
        phase: event.phase,
        keyEventIds: [event.id],
      })
    }
  }

  if (grouped.size === 0) {
    grouped.set(`${state.epoch.id}:${state.epoch.turn}:${state.epoch.phase}`, {
      epoch: state.epoch.id,
      turn: state.epoch.turn,
      phase: state.epoch.phase,
      keyEventIds: [],
    })
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.epoch !== b.epoch) {
      return a.epoch - b.epoch
    }

    if (a.turn !== b.turn) {
      return a.turn - b.turn
    }

    return phaseOrder(a.phase) - phaseOrder(b.phase)
  })
}

function phaseOrder(phase: GamePhase) {
  const order: Record<GamePhase, number> = {
    observe: 0,
    action: 1,
    resolve: 2,
    arbitrate: 3,
  }

  return order[phase]
}

function buildInnerThoughtText(factionId: FactionId, epoch: number, turn: number, state: ReplaySourceState) {
  const actorName = factionById[factionId].name
  const target = getTargetFaction(factionId, `${factionId}:${epoch}:${turn}:target`)
  const targetName = factionById[target].name
  const playerId = state.selectedFactionId ?? 'starlight'
  const playerName = factionById[playerId].name
  const latestPrivate = state.privateMessages.find(
    (message) => message.from === factionId || message.to === factionId,
  )
  const latestMajor = state.events.find((event) => event.priority === 'P0' || event.kind === 'betrayal')
  const privateLine = pickBySeed(AI_PRIVATE_TEMPLATES[factionId], `${factionId}:${epoch}:${turn}:private`)
    .replaceAll('{actorName}', actorName)
    .replaceAll('{targetName}', targetName)
    .replaceAll('{playerName}', playerName)
    .replaceAll('{resource}', '矿脉通道')
    .replaceAll('{secret}', '边境换防名单')
  const publicLine = pickBySeed(AI_SPEECH_TEMPLATES[factionId], `${factionId}:${turn}:${epoch}:speech`)
    .replaceAll('{actorName}', actorName)
    .replaceAll('{targetName}', targetName)
    .replaceAll('{playerName}', playerName)
    .replaceAll('{percent}', String(12 + ((epoch + turn) % 37)))
    .replaceAll('{resource}', '矿脉通道')
    .replaceAll('{secret}', '边境换防名单')
    .replaceAll('{omen}', '黑月')

  if (latestPrivate) {
    const counterparty = latestPrivate.from === factionId ? latestPrivate.to : latestPrivate.from
    return `${factionById[counterparty].name}在密谈里留了退路。${privateLine} 我会假装接受，同时把条件转卖给${targetName}。`
  }

  if (latestMajor) {
    return `${latestMajor.narration}之后，${playerName}的语气太急切了。${publicLine} 我决定先点头，再观察谁会先违约。`
  }

  return `${playerName}提出结盟时语气太急切了，一定是被${targetName}威胁了。${privateLine} 我决定假装接受，实际上已经和${targetName}达成了夹击协议。`
}

function buildAIInnerThoughts(timeline: ReplayTimelineNode[], state: ReplaySourceState): AIInnerThought[] {
  const playerId = state.selectedFactionId
  const aiFactionIds = factionIds.filter((id) => id !== playerId)
  const maxEpoch = Math.max(
    state.epoch.id,
    ...timeline.map((node) => node.epoch),
    ...state.events.map((event) => event.epoch),
    ...state.privateMessages.map((message) => message.epoch),
  )
  const turnKeys: Array<{ epoch: number; turn: number }> = []

  for (let epoch = 1; epoch <= maxEpoch; epoch += 1) {
    const maxTurn =
      epoch === state.epoch.id ? Math.max(state.epoch.turn, TURNS_PER_EPOCH) : TURNS_PER_EPOCH
    for (let turn = 1; turn <= maxTurn; turn += 1) {
      turnKeys.push({ epoch, turn })
    }
  }

  return turnKeys.flatMap(({ epoch, turn }) =>
    aiFactionIds.map((factionId) => ({
      factionId,
      epoch,
      turn,
      text: buildInnerThoughtText(factionId, epoch, turn, state),
    })),
  )
}

function buildFactionCurves(timeline: ReplayTimelineNode[], factions: FactionState[]): FactionCurve[] {
  const nodes = timeline.length > 0 ? timeline : [{ epoch: 1, turn: 1, phase: 'observe' as const, keyEventIds: [] }]

  return factionIds.map((factionId, factionIndex) => {
    const faction = factions.find((item) => item.id === factionId)
    const currentPower = faction?.totalPower ?? 300
    const points = nodes.map((node, index) => {
      const distanceFromEnd = nodes.length - 1 - index
      const wave = Math.sin((index + 1) * (factionIndex + 2) * 0.72) * 16
      const drift = (factionIndex - 3.5) * 4 - distanceFromEnd * (4 + (factionIndex % 3))

      return {
        epoch: node.epoch,
        turn: node.turn,
        totalPower: Math.max(80, Math.round(currentPower + wave + drift)),
      }
    })

    return { factionId, points }
  })
}

function emptyMatrixValue(): RelationshipMatrix {
  return Object.fromEntries(
    factionIds.map((from) => [
      from,
      Object.fromEntries(factionIds.map((to) => [to, from === to ? 'neutral' : 'neutral'])) as Record<
        FactionId,
        RelationshipStatus
      >,
    ]),
  ) as RelationshipMatrix
}

function buildSnapshots(timeline: ReplayTimelineNode[], state: MockGameWorldState): RelationshipSnapshot[] {
  const epochs = [...new Set(timeline.map((node) => node.epoch))]

  return epochs.map((epoch) => {
    const matrix = emptyMatrixValue()
    for (const relationship of state.relationships) {
      matrix[relationship.from][relationship.to] = relationship.status
    }

    for (const from of factionIds) {
      for (const to of factionIds) {
        if (from === to) {
          continue
        }

        const seed = hashText(`${from}:${to}:${epoch}`)
        if (seed % 11 === 0 && matrix[from][to] === 'neutral') {
          matrix[from][to] = 'wary'
        }
        if (seed % 17 === 0 && matrix[from][to] === 'friendly') {
          matrix[from][to] = 'allied'
        }
      }
    }

    return { epoch, matrix }
  })
}

function buildDeceptionStats(events: GameEvent[], privateMessages: PrivateMessage[]): DeceptionStat[] {
  return factionIds.map((factionId, index) => {
    const betrayals = events.filter((event) => event.actor === factionId && event.kind === 'betrayal').length
    const secretTraffic = privateMessages.filter(
      (message) => message.from === factionId || message.to === factionId,
    ).length
    const lies = Math.max(1, betrayals + Math.floor(secretTraffic / 2) + (index % 3))
    const exposed = Math.min(lies, betrayals + (index % 2))
    const successRate = Math.round(((lies - exposed) / lies) * 100)

    return { factionId, lies, exposed, successRate }
  })
}

function buildKeyMoments(events: GameEvent[]): KeyMoment[] {
  return events
    .filter((event) => event.priority === 'P0')
    .map((event, index) => ({
      id: `moment_${event.id}`,
      epoch: event.epoch,
      turn: event.turn,
      eventId: event.id,
      factionId: event.actor ?? undefined,
      title: `名场面 ${String(index + 1).padStart(2, '0')}`,
      caption: event.narration,
    }))
}

export function buildReplay(state: ReplaySourceState): ReplayData {
  const events = ensureRevealEvents(sortByTime(state.events), state)
  const timeline = buildTimeline(events, state)
  const privateMessages = sortByTime(state.privateMessages)

  return {
    timeline,
    privateMessages,
    aiInnerThoughts: buildAIInnerThoughts(timeline, state),
    factionCurves: buildFactionCurves(timeline, state.factions),
    relationshipSnapshots: buildSnapshots(timeline, state),
    deceptionStats: buildDeceptionStats(events, privateMessages),
    events,
    keyMoments: buildKeyMoments(events),
  }
}

export function getReplayEventCategory(event: GameEvent): ReplayEventCategory | null {
  return getEventCategory(event)
}
