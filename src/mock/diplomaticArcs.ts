import { factionById, type FactionId } from '@/mock/factions'
import type { DiplomaticArc, Ripple, WorldGeometryPayload } from '@/protocol/types'

type Capital = WorldGeometryPayload['factions'][number]

const SPEECH_ARC_TTL_MS = 2_200
const PRIVATE_ARC_TTL_MS = 2_000
const SPEECH_RIPPLE_TTL_MS = 1_800
const SPEECH_RIPPLE_MAX_RADIUS = 4.2

function findCapital(worldGeometry: { factions: Capital[] }, factionId: FactionId) {
  return worldGeometry.factions.find((capital) => capital.id === factionId)
}

function createArcId(createdAtMs: number, source: FactionId, target: FactionId, index: number) {
  return `diplomatic_arc_${source}_${target}_${createdAtMs}_${index}`
}

function createRippleId(createdAtMs: number, source: FactionId) {
  return `diplomatic_ripple_${source}_${createdAtMs}`
}

export function createMockDiplomaticVisuals({
  actor,
  target,
  kind,
  worldGeometry,
  createdAtMs = Date.now(),
}: {
  actor: FactionId
  target?: FactionId
  kind: 'speech' | 'private'
  worldGeometry: { factions: Capital[] }
  createdAtMs?: number
}): { arcs: DiplomaticArc[]; ripples: Ripple[] } {
  const sourceCapital = findCapital(worldGeometry, actor)
  if (!sourceCapital) {
    return { arcs: [], ripples: [] }
  }

  const sourceFaction = factionById[actor]

  if (kind === 'private') {
    const targetFactionId = target ?? null
    const targetCapital = targetFactionId ? findCapital(worldGeometry, targetFactionId) : null
    if (!targetCapital || targetCapital.id === sourceCapital.id) {
      return { arcs: [], ripples: [] }
    }

    return {
      arcs: [
        {
          id: createArcId(createdAtMs, actor, targetCapital.id, 0),
          kind: 'private',
          source_faction_id: actor,
          target_faction_id: targetCapital.id,
          start_lat: sourceCapital.capital_lat,
          start_lng: sourceCapital.capital_lng,
          end_lat: targetCapital.capital_lat,
          end_lng: targetCapital.capital_lng,
          color: [sourceFaction.glow, factionById[targetCapital.id].glow],
          ttl_ms: PRIVATE_ARC_TTL_MS,
          created_at_ms: createdAtMs,
        },
      ],
      ripples: [],
    }
  }

  const targetCapitals = worldGeometry.factions
    .filter((capital) => capital.id !== actor)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    arcs: targetCapitals.map((capital, index) => ({
      id: createArcId(createdAtMs, actor, capital.id, index),
      kind: 'speech',
      source_faction_id: actor,
      target_faction_id: capital.id,
      start_lat: sourceCapital.capital_lat,
      start_lng: sourceCapital.capital_lng,
      end_lat: capital.capital_lat,
      end_lng: capital.capital_lng,
      color: [sourceFaction.glow, factionById[capital.id].glow],
      ttl_ms: SPEECH_ARC_TTL_MS,
      created_at_ms: createdAtMs,
    })),
    ripples: [
      {
        id: createRippleId(createdAtMs, actor),
        lat: sourceCapital.capital_lat,
        lng: sourceCapital.capital_lng,
        max_radius: SPEECH_RIPPLE_MAX_RADIUS,
        ttl_ms: SPEECH_RIPPLE_TTL_MS,
        color: sourceFaction.glow,
        created_at_ms: createdAtMs,
      },
    ],
  }
}
