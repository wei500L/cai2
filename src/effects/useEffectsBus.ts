import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { factionIds, factionTokens } from '@/components/hudTheme'
import { gameStoreApi, type GameStoreState } from '@/store/gameStore'
import { useUIStore, type MapQuality } from '@/store/uiStore'
import type { FactionId } from '@/mock/factions'
import type { GameEvent, Relationship } from '@/mock/types'
import { BattleFrontlineParticles } from './war/BattleFrontlineParticles'
import { BorderSparkBoost } from './war/BorderSparkBoost'
import { DeclareWarShockwave } from './war/DeclareWarShockwave'
import { ScreenShake } from './war/ScreenShake'
import type { BattleResultCardData } from './war/BattleResultCard'
import { AllianceBridge } from './AllianceBridge'
import { PrivateBeam } from './PrivateBeam'
import { SpeechRipple } from './SpeechRipple'
import { TradeArc } from './TradeArc'
import type { DiplomacyEffect, MapRenderFrame, Vec2 } from './types'
import { clamp } from './types'

const POOL_SIZE = 8
const TEMP_TRADE_LIFE = 8_000

type EffectPools = {
  speech: SpeechRipple[]
  private: PrivateBeam[]
  trade: TradeArc[]
  alliance: AllianceBridge[]
  declareWar: DeclareWarShockwave[]
  sparkBoost: BorderSparkBoost[]
  frontline: BattleFrontlineParticles[]
}

type ActiveEffects = {
  speech: SpeechRipple[]
  private: PrivateBeam[]
  trade: Map<string, TradeArc>
  alliance: AllianceBridge[]
  declareWar: DeclareWarShockwave[]
  sparkBoost: Map<string, BorderSparkBoost>
  frontline: Map<string, BattleFrontlineParticles>
}

type UseEffectsBusOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  mapQuality: MapQuality
}

function createPools(): EffectPools {
  return {
    speech: Array.from({ length: POOL_SIZE }, (_, index) => new SpeechRipple(`speech_${index}`)),
    private: Array.from({ length: POOL_SIZE }, (_, index) => new PrivateBeam(`private_${index}`)),
    trade: Array.from({ length: POOL_SIZE }, (_, index) => new TradeArc(`trade_${index}`)),
    alliance: Array.from({ length: POOL_SIZE }, (_, index) => new AllianceBridge(`alliance_${index}`)),
    declareWar: Array.from({ length: 4 }, (_, index) => new DeclareWarShockwave(`declare_war_${index}`)),
    sparkBoost: Array.from({ length: 12 }, (_, index) => new BorderSparkBoost(`spark_boost_${index}`)),
    frontline: Array.from({ length: 12 }, (_, index) => new BattleFrontlineParticles(`frontline_${index}`)),
  }
}

function createActiveEffects(): ActiveEffects {
  return {
    speech: [],
    private: [],
    trade: new Map(),
    alliance: [],
    declareWar: [],
    sparkBoost: new Map(),
    frontline: new Map(),
  }
}

function resolveCssColor(token: string, fallback: string) {
  if (typeof window === 'undefined' || !token.startsWith('var(')) {
    return token || fallback
  }

  const variable = token.slice(4, -1).trim()
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
}

function factionGlow(factionId: FactionId) {
  return resolveCssColor(factionTokens[factionId].glow, '#33AAFF')
}

function pairKey(a: FactionId, b: FactionId) {
  return [a, b].sort().join(':')
}

function warKey(a: FactionId, b: FactionId, regionId?: string) {
  return `war:${pairKey(a, b)}:${regionId ?? 'border'}`
}

function fallbackFactionPoint(factionId: FactionId): Vec2 {
  const index = factionIds.indexOf(factionId)
  const angle = (index / factionIds.length) * Math.PI * 2 - Math.PI / 2
  return {
    x: 0.5 + Math.cos(angle) * 0.33,
    y: 0.5 + Math.sin(angle) * 0.33,
  }
}

function getFactionPoint(state: GameStoreState, factionId: FactionId): Vec2 {
  if (state.regions.length === 0) {
    return fallbackFactionPoint(factionId)
  }

  const sortedRows = [...state.regions].sort((a, b) => a.centerLatLng[0] - b.centerLatLng[0])
  const points: Vec2[] = []

  for (let row = 0; row < 8; row += 1) {
    const rowRegions = sortedRows
      .slice(row * 8, row * 8 + 8)
      .sort((a, b) => a.centerLatLng[1] - b.centerLatLng[1])

    for (let col = 0; col < 8; col += 1) {
      const region = rowRegions[col]
      if (region?.owner !== factionId) {
        continue
      }

      const sector = (Math.PI * 2) / 8
      const angle = -Math.PI / 2 + col * sector + sector * 0.5
      const radius = ((row + 0.5) / 8) * 0.5
      points.push({
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius,
      })
    }
  }

  if (points.length === 0) {
    return fallbackFactionPoint(factionId)
  }

  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: clamp(center.x / points.length, 0.06, 0.94),
    y: clamp(center.y / points.length, 0.06, 0.94),
  }
}

function getEventTarget(event: GameEvent): FactionId | null {
  if (event.target) {
    return event.target
  }

  const targets = event.payload.targets
  if (Array.isArray(targets) && typeof targets[0] === 'string') {
    return (factionIds as readonly string[]).includes(targets[0]) ? (targets[0] as FactionId) : null
  }

  return null
}

function isFactionId(value: unknown): value is FactionId {
  return typeof value === 'string' && (factionIds as readonly string[]).includes(value)
}

function getPayloadFaction(event: GameEvent, key: string): FactionId | null {
  const value = event.payload[key]
  return isFactionId(value) ? value : null
}

function getPayloadString(event: GameEvent, key: string) {
  const value = event.payload[key]
  return typeof value === 'string' ? value : undefined
}

function getPayloadNumber(event: GameEvent, key: string) {
  const value = event.payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getNestedNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return undefined
  }

  const nested = (value as Record<string, unknown>)[key]
  return typeof nested === 'number' && Number.isFinite(nested) ? nested : undefined
}

function getMoraleShift(event: GameEvent) {
  const moraleShift = event.payload.morale_shift
  if (typeof moraleShift === 'number' && Number.isFinite(moraleShift)) {
    return { attacker: Math.max(1, Math.round(moraleShift)), defender: -Math.max(1, Math.round(moraleShift)) }
  }

  if (moraleShift && typeof moraleShift === 'object') {
    const attacker = getNestedNumber(moraleShift, 'attacker') ?? 0
    const defender = getNestedNumber(moraleShift, 'defender') ?? 0
    return { attacker, defender }
  }

  return { attacker: 2, defender: -3 }
}

function getRegionPoint(state: GameStoreState, regionId?: string): Vec2 | null {
  if (!regionId) {
    return null
  }

  const sortedRows = [...state.regions].sort((a, b) => a.centerLatLng[0] - b.centerLatLng[0])
  for (let row = 0; row < 8; row += 1) {
    const rowRegions = sortedRows
      .slice(row * 8, row * 8 + 8)
      .sort((a, b) => a.centerLatLng[1] - b.centerLatLng[1])

    for (let col = 0; col < 8; col += 1) {
      const region = rowRegions[col]
      if (region?.id !== regionId) {
        continue
      }

      const sector = (Math.PI * 2) / 8
      const angle = -Math.PI / 2 + col * sector + sector * 0.5
      const radius = ((row + 0.5) / 8) * 0.5
      return {
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius,
      }
    }
  }

  return null
}

function hasTradeTreaty(relationships: Relationship[], a: FactionId, b: FactionId) {
  return relationships.some(
    (relationship) =>
      ((relationship.from === a && relationship.to === b) ||
        (relationship.from === b && relationship.to === a)) &&
      relationship.treaties.includes('trade'),
  )
}

function getTradeTreatyPairs(relationships: Relationship[]) {
  const pairs = new Map<string, [FactionId, FactionId]>()

  for (const relationship of relationships) {
    if (relationship.treaties.includes('trade')) {
      pairs.set(pairKey(relationship.from, relationship.to), [relationship.from, relationship.to])
    }
  }

  return pairs
}

function takeTransient<T extends DiplomacyEffect>(pool: T[], active: T[]) {
  const inactive = pool.find((effect) => !effect.active)
  const effect = inactive ?? active.shift() ?? pool[0]

  if (effect.active) {
    effect.onComplete()
  }

  active.push(effect)
  return effect
}

function removeTrade(active: ActiveEffects, key: string) {
  const effect = active.trade.get(key)

  if (!effect) {
    return
  }

  effect.onComplete()
  active.trade.delete(key)
}

function removeSparkBoost(active: ActiveEffects, key: string) {
  const effect = active.sparkBoost.get(key)
  if (!effect) {
    return
  }

  effect.onComplete()
  active.sparkBoost.delete(key)
}

function removeFrontline(active: ActiveEffects, key: string) {
  const effect = active.frontline.get(key)
  if (!effect) {
    return
  }

  effect.onComplete()
  active.frontline.delete(key)
}

function takeTrade(pool: TradeArc[], active: ActiveEffects, key: string) {
  const existing = active.trade.get(key)

  if (existing) {
    return existing
  }

  if (active.trade.size >= POOL_SIZE) {
    const oldestKey = active.trade.keys().next().value
    if (typeof oldestKey === 'string') {
      removeTrade(active, oldestKey)
    }
  }

  const inactive = pool.find((effect) => !effect.active)
  const effect = inactive ?? pool[0]

  if (effect.active) {
    for (const [activeKey, activeEffect] of active.trade) {
      if (activeEffect === effect) {
        active.trade.delete(activeKey)
        break
      }
    }
    effect.onComplete()
  }

  active.trade.set(key, effect)
  return effect
}

function takeSparkBoost(pool: BorderSparkBoost[], active: ActiveEffects, key: string) {
  const existing = active.sparkBoost.get(key)
  if (existing) {
    return existing
  }

  if (active.sparkBoost.size >= pool.length) {
    const oldestKey = active.sparkBoost.keys().next().value
    if (typeof oldestKey === 'string') {
      removeSparkBoost(active, oldestKey)
    }
  }

  const inactive = pool.find((effect) => !effect.active)
  const effect = inactive ?? pool[0]
  if (effect.active) {
    for (const [activeKey, activeEffect] of active.sparkBoost) {
      if (activeEffect === effect) {
        active.sparkBoost.delete(activeKey)
        break
      }
    }
    effect.onComplete()
  }

  active.sparkBoost.set(key, effect)
  return effect
}

function takeFrontline(pool: BattleFrontlineParticles[], active: ActiveEffects, key: string) {
  const existing = active.frontline.get(key)
  if (existing) {
    return existing
  }

  if (active.frontline.size >= pool.length) {
    const oldestKey = active.frontline.keys().next().value
    if (typeof oldestKey === 'string') {
      removeFrontline(active, oldestKey)
    }
  }

  const inactive = pool.find((effect) => !effect.active)
  const effect = inactive ?? pool[0]
  if (effect.active) {
    for (const [activeKey, activeEffect] of active.frontline) {
      if (activeEffect === effect) {
        active.frontline.delete(activeKey)
        break
      }
    }
    effect.onComplete()
  }

  active.frontline.set(key, effect)
  return effect
}


function getCanvasFrame(canvas: HTMLCanvasElement, quality: MapQuality, time: number): MapRenderFrame {
  const rect = canvas.getBoundingClientRect()
  const radius = Math.min(rect.width, rect.height) * 0.42
  const mapSize = radius * 2

  return {
    width: rect.width,
    height: rect.height,
    mapX: (rect.width - mapSize) / 2,
    mapY: (rect.height - mapSize) / 2,
    mapSize,
    time,
    quality,
  }
}

function parseBattleCard(event: GameEvent): BattleResultCardData | null {
  const attacker = getPayloadFaction(event, 'attacker') ?? event.actor ?? null
  const defender = getPayloadFaction(event, 'defender') ?? event.target ?? null

  if (!attacker || !defender) {
    return null
  }

  const casualties = event.payload.casualties
  const atkLoss =
    getPayloadNumber(event, 'atk_loss') ??
    getNestedNumber(casualties, 'attacker') ??
    getPayloadNumber(event, 'attackerLoss') ??
    0
  const defLoss =
    getPayloadNumber(event, 'def_loss') ??
    getNestedNumber(casualties, 'defender') ??
    getPayloadNumber(event, 'defenderLoss') ??
    0
  const territoryCaptured =
    event.payload.territory_captured === true || event.payload.regionOwnerChanged === true

  return {
    id: event.id,
    event,
    attacker,
    defender,
    regionId: getPayloadString(event, 'regionId') ?? getPayloadString(event, 'region_id'),
    atkLoss,
    defLoss,
    territoryCaptured,
    moraleShift: getMoraleShift(event),
    narration: event.narration,
  }
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.floor(rect.width * ratio))
  const height = Math.max(1, Math.floor(rect.height * ratio))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  return ctx
}

export function useEffectsBus({ canvasRef, mapQuality }: UseEffectsBusOptions) {
  const [battleCard, setBattleCard] = useState<BattleResultCardData | null>(null)
  const poolsRef = useRef<EffectPools | null>(null)
  const activeRef = useRef<ActiveEffects | null>(null)
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const qualityRef = useRef<MapQuality>(mapQuality)
  const dismissBattleCard = useCallback((id: string) => {
    setBattleCard((current) => (current?.id === id ? null : current))
  }, [])

  if (poolsRef.current == null) {
    poolsRef.current = createPools()
  }

  if (activeRef.current == null) {
    activeRef.current = createActiveEffects()
  }

  useEffect(() => {
    qualityRef.current = mapQuality
  }, [mapQuality])

  useEffect(() => {
    seenEventIdsRef.current = new Set(gameStoreApi.getState().events.map((event) => event.id))
  }, [])

  useEffect(() => {
    const spawnSpeech = (state: GameStoreState, event: GameEvent) => {
      if (!event.actor || !activeRef.current || !poolsRef.current) {
        return
      }

      const effect = takeTransient(poolsRef.current.speech, activeRef.current.speech)
      effect.onSpawn({
        origin: getFactionPoint(state, event.actor),
        color: factionGlow(event.actor),
        duration: 2_200,
        maxRadius: 0.46,
      })
    }

    const spawnPrivate = (state: GameStoreState, event: GameEvent) => {
      const target = getEventTarget(event)

      if (!event.actor || !target || !activeRef.current || !poolsRef.current) {
        return
      }

      const effect = takeTransient(poolsRef.current.private, activeRef.current.private)
      effect.onSpawn({
        from: getFactionPoint(state, event.actor),
        to: getFactionPoint(state, target),
        color: '#9933FF',
        life: 5_000,
        density: qualityRef.current === 'high' ? 34 : 24,
      })
    }

    const spawnAlliance = (state: GameStoreState, event: GameEvent) => {
      const target = getEventTarget(event)

      if (!event.actor || !target || !activeRef.current || !poolsRef.current) {
        return
      }

      const effect = takeTransient(poolsRef.current.alliance, activeRef.current.alliance)
      effect.onSpawn({
        a: getFactionPoint(state, event.actor),
        b: getFactionPoint(state, target),
        aColor: factionGlow(event.actor),
        bColor: factionGlow(target),
        life: 6_000,
      })
    }

    const spawnTrade = (state: GameStoreState, event: GameEvent) => {
      const target = getEventTarget(event)

      if (!event.actor || !target || !activeRef.current || !poolsRef.current) {
        return
      }

      const persist = hasTradeTreaty(state.relationships, event.actor, target)
      const key = persist ? `trade:${pairKey(event.actor, target)}` : `trade-event:${event.id}`
      const effect = takeTrade(poolsRef.current.trade, activeRef.current, key)
      effect.onSpawn({
        from: getFactionPoint(state, event.actor),
        to: getFactionPoint(state, target),
        density: qualityRef.current === 'high' ? 24 : 16,
        persist,
        life: TEMP_TRADE_LIFE,
      })
    }

    const syncTradeTreaties = (state: GameStoreState) => {
      if (!activeRef.current || !poolsRef.current) {
        return
      }

      const treatyPairs = getTradeTreatyPairs(state.relationships)
      for (const [key, [from, to]] of treatyPairs) {
        const effect = takeTrade(poolsRef.current.trade, activeRef.current, `trade:${key}`)
        if (!effect.active || !effect.persist) {
          effect.onSpawn({
            from: getFactionPoint(state, from),
            to: getFactionPoint(state, to),
            density: qualityRef.current === 'high' ? 24 : 16,
            persist: true,
          })
        }
      }

      for (const key of activeRef.current.trade.keys()) {
        if (key.startsWith('trade:') && !treatyPairs.has(key.replace('trade:', ''))) {
          removeTrade(activeRef.current, key)
        }
      }
    }

    const spawnWarBoost = (
      state: GameStoreState,
      attacker: FactionId,
      defender: FactionId,
      regionId: string | undefined,
      persist: boolean,
      life = 800,
    ) => {
      if (!activeRef.current || !poolsRef.current) {
        return
      }

      const from = getRegionPoint(state, regionId) ?? getFactionPoint(state, attacker)
      const to = getFactionPoint(state, defender)
      const key = persist ? warKey(attacker, defender, regionId) : `war-flash:${eventSafeRegion(regionId)}:${Date.now()}`
      const boost = takeSparkBoost(poolsRef.current.sparkBoost, activeRef.current, key)
      boost.onSpawn({
        from,
        to,
        attackerColor: factionGlow(attacker),
        defenderColor: factionGlow(defender),
        density: persist ? 54 : 42,
        persist,
        life,
      })

      if (persist) {
        const frontline = takeFrontline(poolsRef.current.frontline, activeRef.current, key)
        frontline.onSpawn({
          from,
          to,
          attackerColor: factionGlow(attacker),
          defenderColor: factionGlow(defender),
          density: 34,
        })
      }
    }

    const spawnDeclareWar = (state: GameStoreState, event: GameEvent) => {
      const attacker = event.actor
      const defender = getEventTarget(event)
      if (!attacker || !defender || !activeRef.current || !poolsRef.current) {
        return
      }

      const regionId =
        getPayloadString(event, 'regionId') ??
        getPayloadString(event, 'region_id') ??
        (event.payload.military && typeof event.payload.military === 'object'
          ? getPayloadString({ ...event, payload: event.payload.military as Record<string, unknown> }, 'targetRegionId')
          : undefined)
      const regionPoint = getRegionPoint(state, regionId)
      const from = getFactionPoint(state, attacker)
      const to = regionPoint ?? getFactionPoint(state, defender)
      const effect = takeTransient(poolsRef.current.declareWar, activeRef.current.declareWar)

      effect.onSpawn({
        from,
        to,
        regionId,
        attackerColor: factionGlow(attacker),
        defenderColor: factionGlow(defender),
        duration: 5_000,
      })
      ScreenShake.trigger('heavy', 1_500)
      spawnWarBoost(state, attacker, defender, regionId, true)
      useUIStore.getState().setMapFocus({ regionId, factionId: attacker })
    }

    const spawnBattle = (state: GameStoreState, event: GameEvent) => {
      const card = parseBattleCard(event)
      if (!card) {
        return
      }

      setBattleCard(card)
      spawnWarBoost(state, card.attacker, card.defender, card.regionId, false, 800)

      if (card.territoryCaptured && card.regionId) {
        window.setTimeout(() => {
          gameStoreApi.getState().updateRegionOwner(card.regionId as string, card.attacker)
          if (event.payload.stateApplied !== true) {
            gameStoreApi.getState().applyBattleOutcome({
              attacker: card.attacker,
              defender: card.defender,
              atkLoss: card.atkLoss,
              defLoss: card.defLoss,
              moraleShift: card.moraleShift,
            })
          }
        }, 260)
      } else if (event.payload.stateApplied !== true) {
        window.setTimeout(() => {
          gameStoreApi.getState().applyBattleOutcome({
            attacker: card.attacker,
            defender: card.defender,
            atkLoss: card.atkLoss,
            defLoss: card.defLoss,
            moraleShift: card.moraleShift,
          })
        }, 260)
      }
    }

    const stopWar = (event: GameEvent) => {
      if (!activeRef.current) {
        return
      }

      const actor = event.actor ?? getPayloadFaction(event, 'from')
      const target = getEventTarget(event) ?? getPayloadFaction(event, 'to')
      const shouldStop = (key: string) => !actor || !target || key.includes(pairKey(actor, target))

      for (const key of [...activeRef.current.sparkBoost.keys()]) {
        if (shouldStop(key)) {
          removeSparkBoost(activeRef.current, key)
        }
      }
      for (const key of [...activeRef.current.frontline.keys()]) {
        if (shouldStop(key)) {
          removeFrontline(activeRef.current, key)
        }
      }
    }

    const handleEvent = (state: GameStoreState, event: GameEvent) => {
      if (event.kind === 'speech') {
        spawnSpeech(state, event)
      } else if (event.kind === 'private') {
        spawnPrivate(state, event)
      } else if (event.kind === 'trade' || event.payload.treatyKind === 'trade') {
        spawnTrade(state, event)
      } else if (event.kind === 'alliance' || event.payload.treatyKind === 'alliance') {
        spawnAlliance(state, event)
      } else if (event.kind === 'declare_war') {
        spawnDeclareWar(state, event)
      } else if (event.kind === 'battle') {
        spawnBattle(state, event)
      } else if (event.kind === 'peace' || event.payload.treatyKind === 'ceasefire') {
        stopWar(event)
      }
    }

    const unsubscribe = gameStoreApi.subscribe((state) => {
      const freshEvents = state.events
        .filter((event) => !seenEventIdsRef.current.has(event.id))
        .sort((a, b) => a.createdAt - b.createdAt)

      for (const event of freshEvents) {
        seenEventIdsRef.current.add(event.id)
        handleEvent(state, event)
      }

      syncTradeTreaties(state)
    })

    syncTradeTreaties(gameStoreApi.getState())

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let frameId = 0
    let lastTime = performance.now()
    const active = activeRef.current

    const tick = (time: number) => {
      const canvas = canvasRef.current

      if (canvas && active) {
        const ctx = resizeCanvas(canvas)

        if (ctx) {
          const frame = getCanvasFrame(canvas, qualityRef.current, time)
          const dt = Math.min(time - lastTime, 50)
          ctx.clearRect(0, 0, frame.width, frame.height)

          updateTransient(active.speech, dt)
          updateTransient(active.private, dt)
          updateTrades(active, dt)
          updateTransient(active.alliance, dt)
          updateTransient(active.declareWar, dt)
          updateSparkBoosts(active, dt)
          updateFrontlines(active, dt)

          drawEffects(ctx, frame, active)
        }
      }

      lastTime = time
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
      if (!active) {
        return
      }
      for (const effect of [
        ...active.speech,
        ...active.private,
        ...active.trade.values(),
        ...active.alliance,
        ...active.declareWar,
        ...active.sparkBoost.values(),
        ...active.frontline.values(),
      ]) {
        effect.onComplete()
      }
      active.speech = []
      active.private = []
      active.trade.clear()
      active.alliance = []
      active.declareWar = []
      active.sparkBoost.clear()
      active.frontline.clear()
    }
  }, [canvasRef])
  return { battleCard, dismissBattleCard }
}

function eventSafeRegion(regionId?: string) {
  return regionId ?? 'border'
}

function updateTransient<T extends DiplomacyEffect>(effects: T[], dt: number) {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index]
    if (!effect.onUpdate(dt)) {
      effect.onComplete()
      effects.splice(index, 1)
    }
  }
}

function updateTrades(active: ActiveEffects, dt: number) {
  for (const [key, effect] of active.trade) {
    if (!effect.onUpdate(dt)) {
      effect.onComplete()
      active.trade.delete(key)
    }
  }
}

function updateSparkBoosts(active: ActiveEffects, dt: number) {
  for (const [key, effect] of active.sparkBoost) {
    if (!effect.onUpdate(dt)) {
      effect.onComplete()
      active.sparkBoost.delete(key)
    }
  }
}

function updateFrontlines(active: ActiveEffects, dt: number) {
  for (const [key, effect] of active.frontline) {
    if (!effect.onUpdate(dt)) {
      effect.onComplete()
      active.frontline.delete(key)
    }
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, frame: MapRenderFrame, active: ActiveEffects) {
  for (const effect of active.trade.values()) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.frontline.values()) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.speech) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.private) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.alliance) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.sparkBoost.values()) {
    effect.draw({ ctx, frame })
  }

  for (const effect of active.declareWar) {
    effect.draw({ ctx, frame })
  }
}
