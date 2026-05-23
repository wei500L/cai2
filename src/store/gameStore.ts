import { create } from 'zustand'
import { tryConsumeRate } from '@/features/commandTerminal/RateLimiter'
import type { CommandSubmission, SubmitSpeechResult } from '@/features/commandTerminal/types'
import { treatyKindLabels, militaryActionLabels } from '@/features/commandTerminal/types'
import { factionById, type FactionId } from '@/mock/factions'
import { createInitialState } from '@/mock/initialState'
import { MAX_EPOCHS, TURNS_PER_EPOCH, getPhaseDurationMs } from '@/mock/gameState'
import type {
  BattleEvent,
  Epoch,
  EventKind,
  FactionState,
  GameEvent,
  MockGameWorldState,
  PrivateMessage,
  Relationship,
  RelationshipStatus,
} from '@/mock/types'
import type {
  EventBundlePayload,
  FactionStatsPatch,
  MapRegionPatch,
  PhasePayload,
  RelationshipPatch,
  StatsDiffPayload,
} from '@/protocol/types'

const MAX_EVENTS = 200
const MAX_PRIVATE_MESSAGES = 100

type GameStoreActions = {
  initGame: (seed?: number) => void
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
  _applyEvents: (payload: GameEvent[] | EventBundlePayload) => void
  _applyMapDiff: (payload: MapRegionPatch[] | { changes: MapRegionPatch[] }) => void
  _applyStatsDiff: (payload: StatsDiffPayload | {
    faction_stats?: FactionStatsPatch[]
    relationship_changes?: RelationshipPatch[]
  }) => void
  togglePause: () => void
  selectFaction: (id: FactionId) => void
  clearFaction: () => void
}

export type GameStoreState = MockGameWorldState & {
  selectedFactionId: FactionId | null
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

function createEventId(prefix: string) {
  eventSequence += 1
  return `${prefix}_${Date.now()}_${eventSequence}`
}

function createPhaseKey(epoch: Epoch) {
  return `E${epoch.id}:T${epoch.turn}:${epoch.phase}`
}

function isKnownFaction(value: string): value is FactionId {
  return value in factionById
}

function getTargetNames(targets: FactionId[]) {
  return targets.map((target) => factionById[target].name).join('、')
}

function findMentionedFaction(content: string, actor: FactionId) {
  return Object.values(factionById).find(
    (faction) =>
      faction.id !== actor && (content.includes(faction.name) || content.includes(faction.id)),
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
  return actor === 'darkTide' || actor === 'starlight' || actor === 'voidChurch'
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

const initialState = createInitialState()

export const useGameStore = create<GameStoreState>((set, get) => ({
  ...initialState,
  selectedFactionId: null,

  initGame: (seed) => {
    const nextState = createInitialState(seed)
    set((state) => ({
      ...nextState,
      selectedFactionId: state.selectedFactionId,
    }))
  },

  pushEvent: (event) => {
    set((state) => ({
      events: pushEventToList(state.events, event),
    }))
  },

  advancePhase: () => {
    set((state) => {
      const epoch = nextEpochState(state.epoch)

      if (!epoch) {
        return { isPaused: true }
      }

      return { epoch }
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
      const loser = winner === attackerId ? defenderId : attackerId
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
      speech: `${factionById[actor].name}发表公开演讲，预计文化影响 +${estimateCultureGain(content, toneHeat)}`,
      private: `${factionById[actor].name}向${targetNames}发送加密密谈`,
      treaty: `${factionById[actor].name}向${targetNames}提出${treatyLabel ?? '条约'}草案`,
      military: `${factionById[actor].name}下达${militaryLabel ?? '战术'}军令`,
      intel: `${factionById[actor].name}请求针对${targetNames}的情报`,
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
            narration: `${factionById[actor].name}的强硬措辞被记录为潜在背叛倾向`,
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
            subject: `密谈：${factionById[target].name}`,
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
      privateMessages: privateMessage
        ? [privateMessage, ...current.privateMessages].slice(0, MAX_PRIVATE_MESSAGES)
        : current.privateMessages,
    }))

    return { ok: true, eventId }
  },

  _applyPhase: (payload) => {
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
      isPaused: 'is_paused' in payload && typeof payload.is_paused === 'boolean' ? payload.is_paused : state.isPaused,
    }))
  },

  _applyEvents: (payload) => {
    const events = Array.isArray(payload) ? payload : payload.events
    const privateMessages = Array.isArray(payload) ? [] : (payload.private_messages ?? [])

    set((state) => ({
      events: pushEventsToList(state.events, events),
      privateMessages:
        privateMessages.length > 0
          ? pushPrivateMessagesToList(state.privateMessages, privateMessages)
          : state.privateMessages,
    }))
  },

  _applyMapDiff: (payload) => {
    const changes = Array.isArray(payload) ? payload : payload.changes

    if (changes.length === 0) {
      return
    }

    set((state) => ({
      regions: state.regions.map((region) => {
        const patch = changes.find((change) => change.id === region.id)
        return patch ? { ...region, ...patch } : region
      }),
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

  togglePause: () => {
    set((state) => ({ isPaused: !state.isPaused }))
  },

  selectFaction: (selectedFactionId) => {
    set({ selectedFactionId })
  },

  clearFaction: () => {
    set({ selectedFactionId: null })
  },
}))

export const gameStoreApi = {
  getState: useGameStore.getState,
  setState: useGameStore.setState,
  subscribe: useGameStore.subscribe,
}

export const subscribe = useGameStore.subscribe
