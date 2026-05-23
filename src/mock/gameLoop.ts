import { factionIds } from '@/components/hudTheme'
import { SYSTEM_NARRATION_TEMPLATES } from '@/mock/aiTemplates'
import { factionById, type FactionId } from '@/mock/factions'
import { MAX_EPOCHS } from '@/mock/gameState'
import type { EventKind, EventPriority, GameEvent, PrivateMessage, SpeechEvent } from '@/mock/types'
import type { MockTransport } from '@/protocol/transport'
import { gameStoreApi } from '@/store/gameStore'
import { getRemainingMs } from '@/utils/serverClock'
import { mulberry32, pickOne, randomInt, weightedPick } from '@/utils/random'

const DEFAULT_LOOP_SEED = 9_197
const RANDOM_EVENT_MIN_INTERVAL_MS = 5_000
const RANDOM_EVENT_MAX_INTERVAL_MS = 12_000
const phaseLabels = {
  observe: '态势感知期',
  action: '行动期',
  resolve: '博弈期',
  arbitrate: '裁决阶段',
} as const

const arbitratePhaseLabels = {
  battle: '战争结算',
  epic: '史诗时刻',
  summary: '纪元总结',
} as const

let activeStop: (() => void) | null = null
let loopEventSequence = 0

function createLoopEventId(prefix: string) {
  loopEventSequence += 1
  return `${prefix}_${Date.now()}_${loopEventSequence}`
}

function getRandomPair(rng: () => number): [FactionId, FactionId] {
  const actor = pickOne(rng, factionIds)
  let target = pickOne(rng, factionIds)

  while (target === actor) {
    target = pickOne(rng, factionIds)
  }

  return [actor, target]
}

function getRandomPriority(rng: () => number): EventPriority {
  return weightedPick(rng, [
    { item: 'P2' as const, weight: 68 },
    { item: 'P1' as const, weight: 24 },
    { item: 'P0' as const, weight: 8 },
  ])
}

function getPhaseChangeNarration(epoch = gameStoreApi.getState().epoch) {
  const phaseName =
    epoch.phase === 'arbitrate' && epoch.arbitratePhase
      ? `${phaseLabels.arbitrate}/${arbitratePhaseLabels[epoch.arbitratePhase]}`
      : phaseLabels[epoch.phase]
  const templates = SYSTEM_NARRATION_TEMPLATES.phase_change
  const template = templates[Math.floor(Math.random() * templates.length)]

  return template
    .replace('{epoch}', String(epoch.id))
    .replace('{turn}', String(epoch.turn))
    .replace('{phaseName}', phaseName)
}

function pushPhaseChangeEvent(transport: MockTransport, end = false) {
  const { epoch } = gameStoreApi.getState()

  transport.emitEvents([{
    id: createLoopEventId(end ? 'game_end' : 'phase_change'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority: end ? 'P0' : 'P2',
    kind: 'phase_change',
    payload: {
      phase: epoch.phase,
      arbitratePhase: epoch.arbitratePhase,
      remainingMs: Math.max(0, getRemainingMs(epoch.phaseStartedAt, epoch.phaseDurationMs)),
      end,
    },
    narration: end ? '第八纪元裁决完成，模拟战局进入封存状态' : getPhaseChangeNarration(),
  }])
}

function pushSpeechEvent(
  transport: MockTransport,
  rng: () => number,
  actor: FactionId,
  target: FactionId,
  priority: EventPriority,
) {
  const { epoch } = gameStoreApi.getState()
  const stance = pickOne(rng, [
    'conciliatory',
    'threatening',
    'pragmatic',
    'ceremonial',
  ] as const)
  const narration = `${factionById[actor].name}向${factionById[target].name}发表公开声明`
  const event: SpeechEvent = {
    id: createLoopEventId('speech'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority,
    kind: 'speech',
    actor,
    target,
    payload: {
      channel: 'public',
      stance,
      text: narration,
    },
    narration,
  }

  transport.emitActionEvent(event)
}

function pushPrivateEvent(transport: MockTransport, actor: FactionId, target: FactionId, priority: EventPriority) {
  const { epoch } = gameStoreApi.getState()
  const message: PrivateMessage = {
    id: createLoopEventId('private_message'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    from: actor,
    to: target,
    priority,
    subject: '密谈窗口',
    body: `${factionById[actor].name}向${factionById[target].name}发送一份加密条件清单`,
    encrypted: true,
    payload: { channel: 'mock_private' },
  }

  transport.emitActionEvent({
    id: createLoopEventId('private'),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority,
    kind: 'private',
    actor,
    target,
    payload: { messageId: message.id, encrypted: message.encrypted },
    narration: `${factionById[actor].name}与${factionById[target].name}开启密谈`,
  }, message)
}

function pushSimpleEvent(
  transport: MockTransport,
  kind: EventKind,
  actor: FactionId,
  target: FactionId,
  priority: EventPriority,
) {
  const { epoch, relationships } = gameStoreApi.getState()
  let narration: string
  let delta = 0

  if (kind === 'trade') {
    narration = `${factionById[actor].name}向${factionById[target].name}发起贸易提议`
    delta = 5
  } else if (kind === 'betrayal') {
    narration = `${factionById[actor].name}撤回对${factionById[target].name}的边境承诺`
    delta = -16
  } else {
    narration = `${factionById[actor].name}截获与${factionById[target].name}相关的异常情报`
  }

  if (delta !== 0) {
    const relationship = relationships.find((item) => item.from === actor && item.to === target)

    if (relationship) {
      transport.emitStatsDiff({
        faction_stats: [],
        relationship_changes: [{
          from_faction: actor,
          to_faction: target,
          delta,
          reason: kind,
        }],
      })
    }
  }

  const event: GameEvent = {
    id: createLoopEventId(kind),
    createdAt: Date.now(),
    epoch: epoch.id,
    turn: epoch.turn,
    phase: epoch.phase,
    priority,
    kind,
    actor,
    target,
    payload: { relationshipDelta: delta },
    narration,
  }

  transport.emitActionEvent(event)
}

function pushRandomMockEvent(transport: MockTransport, rng: () => number) {
  const [actor, target] = getRandomPair(rng)
  const priority = getRandomPriority(rng)
  const kind = weightedPick(rng, [
    { item: 'speech' as const, weight: 24 },
    { item: 'private' as const, weight: 20 },
    { item: 'trade' as const, weight: 20 },
    { item: 'battle' as const, weight: 12 },
    { item: 'betrayal' as const, weight: 10 },
    { item: 'intel' as const, weight: 14 },
  ])

  if (kind === 'speech') {
    pushSpeechEvent(transport, rng, actor, target, priority)
    return
  }

  if (kind === 'private') {
    pushPrivateEvent(transport, actor, target, priority)
    return
  }

  if (kind === 'battle') {
    const { regions } = gameStoreApi.getState()
    const targetRegions = regions.filter((region) => region.owner === target)
    const region = targetRegions.length > 0 ? pickOne(rng, targetRegions) : pickOne(rng, regions)
    transport.resolveBattle(actor, target, region.id)
    return
  }

  pushSimpleEvent(transport, kind, actor, target, priority)
}

function isTerminalEpochReady() {
  const { epoch } = gameStoreApi.getState()

  return (
    epoch.id >= MAX_EPOCHS &&
    epoch.phase === 'arbitrate' &&
    epoch.arbitratePhase === 'summary' &&
    getRemainingMs(epoch.phaseStartedAt, epoch.phaseDurationMs) <= 0
  )
}

function getNextRandomEventAt(rng: () => number, now: number) {
  return now + randomInt(rng, RANDOM_EVENT_MIN_INTERVAL_MS, RANDOM_EVENT_MAX_INTERVAL_MS)
}

export function startMockGameLoop(transport: MockTransport, seed = DEFAULT_LOOP_SEED) {
  activeStop?.()

  if (typeof window === 'undefined') {
    return () => undefined
  }

  const rng = mulberry32(seed)
  let stopped = false
  let frameId = 0
  let lastFrameAt = performance.now()
  let nextRandomEventAt = getNextRandomEventAt(rng, lastFrameAt)

  const stop = () => {
    if (stopped) {
      return
    }

    stopped = true
    window.cancelAnimationFrame(frameId)
    if (activeStop === stop) {
      activeStop = null
    }
  }

  const frame = (now: number) => {
    if (stopped) {
      return
    }

    const state = gameStoreApi.getState()
    const deltaMs = now - lastFrameAt
    lastFrameAt = now

    if (!state.isPaused) {
      transport.tickPhase(deltaMs)

      if (isTerminalEpochReady()) {
        transport.emitPhase(gameStoreApi.getState().epoch, true)
        pushPhaseChangeEvent(transport, true)
        transport.emitRoomFinished('第八纪元裁决完成，模拟战局进入封存状态，复盘即将开启。')
        stop()
        return
      }

      const afterTick = gameStoreApi.getState()
      const remainingMs = getRemainingMs(
        afterTick.epoch.phaseStartedAt,
        afterTick.epoch.phaseDurationMs,
      )

      if (remainingMs <= 0) {
        transport.advancePhase()
        pushPhaseChangeEvent(transport)
        nextRandomEventAt = getNextRandomEventAt(rng, now)
      } else if (
        (afterTick.epoch.phase === 'action' || afterTick.epoch.phase === 'resolve') &&
        now >= nextRandomEventAt
      ) {
        pushRandomMockEvent(transport, rng)
        nextRandomEventAt = getNextRandomEventAt(rng, now)
      }
    }

    frameId = window.requestAnimationFrame(frame)
  }

  frameId = window.requestAnimationFrame(frame)
  activeStop = stop

  return stop
}
