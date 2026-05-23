import type { FactionId } from '@/types/faction'
import type { DiplomaticArc, Ripple } from '@/protocol/types'
import styles from './labels.module.css'

export type FactionRelationBadge = '中立' | '友好' | '敌对'

export type GlobeCapitalDatum = {
  id: FactionId
  lat: number
  lng: number
  name: string
  glow: string
  badge: FactionRelationBadge
}

function clampBadge(badge: string): FactionRelationBadge {
  if (badge === '友好' || badge === '敌对') {
    return badge
  }

  return '中立'
}

export function createLabelDiv(capital: GlobeCapitalDatum) {
  const anchor = document.createElement('div')
  anchor.className = styles.factionLabelAnchor
  anchor.style.color = capital.glow
  anchor.style.setProperty('--faction-glow', capital.glow)

  const el = document.createElement('div')
  el.className = styles.factionLabel

  const name = document.createElement('span')
  name.className = styles.factionName
  name.textContent = capital.name

  const badge = document.createElement('span')
  badge.className = styles.factionBadge
  badge.textContent = clampBadge(capital.badge)

  el.append(name, badge)
  anchor.append(el)
  return anchor
}

function lookupCapital(
  capitals: GlobeCapitalDatum[] | undefined,
  factionId: string | undefined,
) {
  if (!capitals || !factionId) {
    return null
  }

  return capitals.find((capital) => capital.id === factionId) ?? null
}

export function buildArcsData(arcs: DiplomaticArc[], capitals?: GlobeCapitalDatum[]) {
  return arcs
    .map((arc) => {
      const source = lookupCapital(capitals, arc.source_faction_id ?? arc.from_faction)
      const target = lookupCapital(capitals, arc.target_faction_id ?? arc.to_faction)
      const startLat = arc.start_lat ?? source?.lat
      const startLng = arc.start_lng ?? source?.lng
      const endLat = arc.end_lat ?? target?.lat
      const endLng = arc.end_lng ?? target?.lng

      if (
        typeof startLat !== 'number' ||
        typeof startLng !== 'number' ||
        typeof endLat !== 'number' ||
        typeof endLng !== 'number'
      ) {
        return null
      }

      return {
        startLat,
        startLng,
        endLat,
        endLng,
        color: arc.color,
        stroke: arc.stroke ?? 0.6,
        dashLength: arc.dash_length ?? 0.3,
        dashGap: arc.dash_gap ?? 0.05,
        dashAnimateTime: arc.dash_animate_time ?? (arc.kind === 'private' ? 2_000 : 1_500),
      }
    })
    .filter((arc): arc is NonNullable<typeof arc> => arc !== null)
}

export function buildPointsData(capitals: GlobeCapitalDatum[]) {
  return capitals.map((capital) => ({
    id: capital.id,
    lat: capital.lat,
    lng: capital.lng,
    color: capital.glow,
    radius: 0.6,
    altitude: 0.01,
    label: capital.name,
  }))
}

export function buildRingsData(ripples: Ripple[]) {
  return ripples.map((ripple) => ({
    lat: ripple.lat,
    lng: ripple.lng,
    maxR: ripple.max_radius,
    propagationSpeed: (ripple.max_radius / ripple.ttl_ms) * 1000,
    repeatPeriod: ripple.ttl_ms,
    color: ripple.color,
  }))
}

export function buildHtmlElementsData(capitals: GlobeCapitalDatum[]) {
  return capitals.map((capital) => ({
    id: capital.id,
    lat: capital.lat,
    lng: capital.lng,
    name: capital.name,
    glow: capital.glow,
    badge: clampBadge(capital.badge),
  }))
}
