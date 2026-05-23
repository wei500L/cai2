import { factionIds } from '@/components/hudTheme'
import { factionById, type FactionId } from '@/mock/factions'
import { getPhaseDurationMs } from '@/mock/gameState'
import type {
  EventPriority,
  FactionState,
  GameEvent,
  MapRegion,
  MockGameWorldState,
  Relationship,
  RelationshipStatus,
  TreatyKind,
} from '@/mock/types'
import { buildNeighbors } from '@/render/buildNeighbors'
import { mulberry32, randomFloat, randomInt, shuffle } from '@/utils/random'

const DEFAULT_INITIAL_SEED = 2_026_052_2

const terrainDeck: MapRegion['terrain'][] = [
  'mountain',
  'plains',
  'river',
  'fortress',
  'desert',
]

const alliancePairs: readonly [FactionId, FactionId][] = [
  ['starlight', 'aurora'],
  ['emerald', 'darkTide'],
]

const hostilePairs: readonly [FactionId, FactionId][] = [['ironCrown', 'ashen']]

const initialFactionStats: Record<
  FactionId,
  Omit<FactionState, 'id' | 'totalPower' | 'status'>
> = {
  ironCrown: { military: 88, economy: 62, diplomacy: 38, culture: 46, morale: 74 },
  starlight: { military: 56, economy: 70, diplomacy: 82, culture: 66, morale: 68 },
  emerald: { military: 48, economy: 90, diplomacy: 76, culture: 58, morale: 63 },
  ashen: { military: 82, economy: 45, diplomacy: 42, culture: 60, morale: 84 },
  voidChurch: { military: 54, economy: 58, diplomacy: 64, culture: 88, morale: 72 },
  aurora: { military: 46, economy: 72, diplomacy: 78, culture: 74, morale: 69 },
  magma: { military: 70, economy: 84, diplomacy: 36, culture: 52, morale: 66 },
  darkTide: { military: 50, economy: 68, diplomacy: 86, culture: 61, morale: 59 },
}

function getFactionStatus(totalPower: number): FactionState['status'] {
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

function createFactionStates() {
  return factionIds.map((id) => {
    const stats = initialFactionStats[id]
    const totalPower =
      stats.military + stats.economy + stats.diplomacy + stats.culture + stats.morale

    return {
      id,
      ...stats,
      totalPower,
      status: getFactionStatus(totalPower),
    }
  })
}

function pairKey(a: FactionId, b: FactionId) {
  return [a, b].sort().join(':')
}

function createRegions(seed: number) {
  const rng = mulberry32(seed + 101)
  const owners = shuffle(
    rng,
    factionIds.flatMap((id) => Array.from({ length: 8 }, () => id)),
  )

  return Array.from({ length: 64 }, (_, index): MapRegion => {
    const row = Math.floor(index / 8)
    const col = index % 8
    const terrain = terrainDeck[(index + randomInt(rng, 0, terrainDeck.length - 1)) % terrainDeck.length]

    return {
      id: `region_${index}`,
      owner: owners[index],
      resourceValue: randomInt(rng, 18, 96),
      developmentLevel: randomInt(rng, 1, 5),
      centerLatLng: [
        Number((18 + row * 4.8 + randomFloat(rng, -0.8, 0.8)).toFixed(3)),
        Number((72 + col * 5.2 + randomFloat(rng, -1.1, 1.1)).toFixed(3)),
      ],
      terrain,
      minGarrison: 10,
      supplyLines: randomInt(rng, 1, 3),
      neighbors: [],
    }
  })
}

function createRelationships(seed: number) {
  const rng = mulberry32(seed + 202)
  const allianceKeys = new Set(alliancePairs.map(([from, to]) => pairKey(from, to)))
  const hostileKeys = new Set(hostilePairs.map(([from, to]) => pairKey(from, to)))
  const relationships: Relationship[] = []

  for (const from of factionIds) {
    for (const to of factionIds) {
      if (from === to) {
        continue
      }

      const key = pairKey(from, to)
      let value = randomInt(rng, -40, 40)
      let status: RelationshipStatus = value < -10 ? 'wary' : 'neutral'
      let treaties: TreatyKind[] = []

      if (allianceKeys.has(key)) {
        value = 40
        status = 'allied'
        treaties = ['alliance', 'trade', 'non_aggression']
      } else if (hostileKeys.has(key)) {
        value = -40
        status = 'hostile'
      }

      relationships.push({ from, to, value, status, treaties })
    }
  }

  return relationships
}

function createInitialEvents(now: number): GameEvent[] {
  const templates: { actor: FactionId; target?: FactionId; narration: string }[] = [
    { actor: 'starlight', target: 'aurora', narration: '星辉联邦与极光共和同步科研边界数据' },
    { actor: 'emerald', target: 'darkTide', narration: '翡翠王庭向暗潮商会开放一条低调贸易线' },
    { actor: 'ironCrown', target: 'ashen', narration: '铁冠帝国在灰烬部族边境集结装甲纵队' },
    { actor: 'voidChurch', narration: '虚空教廷发布新的星象训令' },
    { actor: 'magma', narration: '熔岩议会提高矿脉配给优先级' },
  ]

  return templates
    .map((event, index): GameEvent => ({
      id: `initial_event_${index}`,
      createdAt: now - (templates.length - index) * 1_000,
      epoch: 1,
      turn: 1,
      phase: 'observe',
      priority: 'P2' satisfies EventPriority,
      kind: index === 2 ? 'intel' : 'economy',
      actor: event.actor,
      target: event.target,
      payload: { placeholder: true },
      narration: event.narration,
    }))
    .reverse()
}

export function createInitialState(seed = DEFAULT_INITIAL_SEED): MockGameWorldState {
  const now = Date.now()
  const regions = createRegions(seed)
  const neighborsByRegion = buildNeighbors(regions)

  return {
    epoch: {
      id: 1,
      turn: 1,
      phase: 'observe',
      phaseStartedAt: now,
      phaseDurationMs: getPhaseDurationMs('observe'),
    },
    factions: createFactionStates(),
    relationships: createRelationships(seed),
    treaties: [],
    regions: regions.map((region) => ({
      ...region,
      neighbors: neighborsByRegion[region.id] ?? [],
    })),
    events: createInitialEvents(now),
    privateMessages: [],
    isPaused: false,
  }
}

export function getFactionName(id: FactionId) {
  return factionById[id].name
}
