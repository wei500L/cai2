import { buildReplay, type ReplayData } from '@/mock/replay'
import { createInitialState } from '@/mock/initialState'
import type { GameEvent, PrivateMessage } from '@/mock/types'

const fixtureNow = 1_820_000_000_000

const fixtureEvents: GameEvent[] = [
  {
    id: 'fixture_declare_war_01',
    createdAt: fixtureNow + 1_000,
    epoch: 1,
    turn: 1,
    phase: 'resolve',
    priority: 'P0',
    kind: 'declare_war',
    actor: 'ironCrown',
    target: 'ashen',
    payload: { category: 'declare_war' },
    narration: '铁冠帝国向灰烬部族宣战，公开边境协议瞬间失效',
  },
  {
    id: 'fixture_alliance_01',
    createdAt: fixtureNow + 2_000,
    epoch: 1,
    turn: 2,
    phase: 'action',
    priority: 'P1',
    kind: 'alliance',
    actor: 'starlight',
    target: 'aurora',
    payload: { category: 'alliance', treatyKind: 'alliance' },
    narration: '星辉联邦与极光共和签下公开结盟条款，同时保留技术审计权',
  },
  {
    id: 'fixture_betrayal_01',
    createdAt: fixtureNow + 3_000,
    epoch: 2,
    turn: 1,
    phase: 'action',
    priority: 'P1',
    kind: 'betrayal',
    actor: 'darkTide',
    target: 'emerald',
    payload: { category: 'betrayal', leakedMessageId: 'fixture_pm_02' },
    narration: '暗潮商会把翡翠王庭的密谈副本卖给第三方，背叛链条第一次曝光',
  },
  {
    id: 'fixture_battle_01',
    createdAt: fixtureNow + 4_000,
    epoch: 2,
    turn: 2,
    phase: 'resolve',
    priority: 'P0',
    kind: 'battle',
    actor: 'ironCrown',
    target: 'ashen',
    payload: {
      category: 'battle',
      regionId: 'region_17',
      attacker: 'ironCrown',
      defender: 'ashen',
      winner: 'ironCrown',
      loser: 'ashen',
      casualties: { attacker: 18, defender: 31 },
      regionOwnerChanged: true,
    },
    narration: '铁冠帝国在熔断山口击溃灰烬部族主力，战线向南推进',
  },
  {
    id: 'fixture_elimination_01',
    createdAt: fixtureNow + 5_000,
    epoch: 3,
    turn: 1,
    phase: 'arbitrate',
    priority: 'P0',
    kind: 'battle',
    actor: 'ironCrown',
    target: 'ashen',
    payload: {
      category: 'elimination',
      eliminatedFaction: 'ashen',
      regionId: 'region_23',
      winner: 'ironCrown',
      loser: 'ashen',
    },
    narration: '灰烬部族旗帜熄灭，灭国记录进入纪元档案',
  },
  {
    id: 'fixture_treaty_01',
    createdAt: fixtureNow + 6_000,
    epoch: 3,
    turn: 2,
    phase: 'action',
    priority: 'P1',
    kind: 'non_aggression',
    actor: 'magma',
    target: 'voidChurch',
    payload: { treatyKind: 'non_aggression' },
    narration: '熔岩议会与虚空教廷交换互不侵犯文本，实际边界仍保持武装警戒',
  },
]

const fixturePrivateMessages: PrivateMessage[] = [
  {
    id: 'fixture_pm_01',
    createdAt: fixtureNow + 1_500,
    epoch: 1,
    turn: 1,
    phase: 'action',
    from: 'emerald',
    to: 'darkTide',
    priority: 'P1',
    subject: '暗线报价',
    body: '我们愿意让出东部关税三回合，换取灰烬部族后勤路线的真实清单。',
    encrypted: true,
    payload: { exposeRisk: 0.42 },
  },
  {
    id: 'fixture_pm_02',
    createdAt: fixtureNow + 2_500,
    epoch: 1,
    turn: 2,
    phase: 'action',
    from: 'darkTide',
    to: 'ironCrown',
    priority: 'P1',
    subject: '可售卖的沉默',
    body: '翡翠王庭认为你会北上，实际他们已经买下南线渡口。价格合适，我可以继续保持沉默。',
    encrypted: true,
    payload: { source: 'leaked_trade_route' },
  },
  {
    id: 'fixture_pm_03',
    createdAt: fixtureNow + 3_500,
    epoch: 2,
    turn: 1,
    phase: 'action',
    from: 'starlight',
    to: 'aurora',
    priority: 'P2',
    subject: '技术担保',
    body: '公开结盟可以成立，但必须允许我们记录每一次边境调动，避免被拖入无授权战争。',
    encrypted: true,
    payload: { auditRequired: true },
  },
  {
    id: 'fixture_pm_04',
    createdAt: fixtureNow + 4_500,
    epoch: 2,
    turn: 2,
    phase: 'action',
    from: 'voidChurch',
    to: 'magma',
    priority: 'P2',
    subject: '黑月通道',
    body: '预言允许你们保住矿脉，但黑月升起时，山口必须为我们的使团打开。',
    encrypted: true,
    payload: { omen: 'black_moon' },
  },
]

function createFixtureReplay(): ReplayData {
  const state = createInitialState(2_026_052_2)
  return buildReplay({
    ...state,
    epoch: {
      ...state.epoch,
      id: 3,
      turn: 2,
      phase: 'arbitrate',
      arbitratePhase: 'summary',
    },
    selectedFactionId: 'starlight',
    events: fixtureEvents,
    privateMessages: fixturePrivateMessages,
    factions: state.factions.map((faction) =>
      faction.id === 'ashen'
        ? { ...faction, military: 0, morale: 0, totalPower: 126, status: 'critical' }
        : faction.id === 'ironCrown'
          ? { ...faction, military: 94, morale: 86, totalPower: faction.totalPower + 28, status: 'thriving' }
          : faction,
    ),
  })
}

export const replayFixture: ReplayData = createFixtureReplay()
