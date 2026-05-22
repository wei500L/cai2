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
  FactionState,
  GameEvent,
  MockGameWorldState,
  PrivateMessage,
  Relationship,
  RelationshipStatus,
} from '@/mock/types'

const MAX_EVENTS = 200
const MAX_PRIVATE_MESSAGES = 100

type GameStoreActions = {
  initGame: (seed?: number) => void
  pushEvent: (event: GameEvent) => void
  advancePhase: () => void
  tickPhase: (deltaMs: number) => void
  updateRelationship: (from: FactionId, to: FactionId, delta: number) => void
  updateRegionOwner: (regionId: string, newOwner: FactionId | null) => void
  triggerBattle: (attackerId: FactionId, defenderId: FactionId, regionId: string) => void
  addPrivateMessage: (message: PrivateMessage) => void
  submitSpeech: (submission: CommandSubmission) => SubmitSpeechResult
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
  return [event, ...events].slice(0, MAX_EVENTS)
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
          regionOwnerChanged,
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
    const targets = submission.targets.filter((target) => target !== actor)
    const toneHeat = submission.tone?.heat ?? 0
    const priority = submission.tone?.isAggressive ? 'P1' : 'P2'
    const eventKind = submission.mode
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
