import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import Globe from 'globe.gl'
import type { GlobeInstance } from 'globe.gl'
import { MeshLambertMaterial, type Camera, type Scene, type WebGLRenderer } from 'three'
import {
  buildHexPolygons,
  hexPolygonAltitude,
  hexPolygonMargin,
  type HexPolygonInput,
} from '@/render/globe/buildHexPolygons'
import { buildArcsData, buildPointsData, type GlobeCapitalDatum } from '@/render/globe/dataLayers'
import { hexPolygonColor } from '@/render/globe/stylePresets'
import { GlobeInstanceProvider } from '@/render/globe/GlobeInstanceProvider'
import type { GlobeInstanceSnapshot } from '@/render/globe/globeTypes'
import { useAllFactionMeta } from '@/store/factionMetaStore'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'

const GLOBE_BASE_COLOR = '#101824'
const ARC_MAX_ALTITUDE = 0.028

type GlobeApi = GlobeInstance & {
  globeImageUrl(url: string | null): GlobeInstance
  enablePointerInteraction?: (enabled: boolean) => GlobeInstance
  arcsData: (data: unknown[]) => GlobeInstance
  arcColor: (value: unknown) => GlobeInstance
  arcStroke: (value: unknown) => GlobeInstance
  arcDashLength: (value: unknown) => GlobeInstance
  arcDashGap: (value: unknown) => GlobeInstance
  arcDashAnimateTime: (value: unknown) => GlobeInstance
  arcAltitude: (value: unknown) => GlobeInstance
  pointsData: (data: unknown[]) => GlobeInstance
  pointColor: (value: unknown) => GlobeInstance
  pointRadius: (value: unknown) => GlobeInstance
  pointAltitude: (value: unknown) => GlobeInstance
  pointResolution: (value: unknown) => GlobeInstance
}

function toSnapshot(globe: GlobeInstance): GlobeInstanceSnapshot {
  return {
    globe,
    scene: globe.scene() as Scene,
    camera: globe.camera() as Camera,
    renderer: globe.renderer() as WebGLRenderer,
  }
}

function unwrapHexPolygonData<T>(hexPolygon: T | { __data?: T }): T {
  return ((hexPolygon as { __data?: T }).__data ?? hexPolygon) as T
}

export function MapStageGlobe({
  children,
  zoom = 1,
  transitionMs = 400,
}: {
  children?: ReactNode
  zoom?: number
  transitionMs?: number
}) {
  const globeRef = useRef<GlobeInstance | null>(null)
  const [published, setPublished] = useState<GlobeInstanceSnapshot | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const diplomaticArcs = useGameStore((state) => state.diplomaticArcs)
  const regions = useGameStore((state) => state.regions)
  const worldGeometry = useGameStore((state) => state.worldGeometry)
  const scorchedRegions = useMapStore((state) => state.scorchedRegions)
  const factionMetaById = useAllFactionMeta()
  const capitals = useMemo<GlobeCapitalDatum[]>(() => {
    if (!worldGeometry?.factions.length) {
      return []
    }

    return worldGeometry.factions.map((capital) => {
      const meta = factionMetaById.find((faction) => faction.id === capital.id)
      return {
        id: capital.id,
        lat: capital.capital_lat,
        lng: capital.capital_lng,
        name: meta?.name ?? capital.id,
        glow: meta?.glow ?? '#8fcaff',
        badge: '中立' as const,
      }
    })
  }, [factionMetaById, worldGeometry])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const portalHostElement = document.createElement('div')
    portalHostElement.dataset.layer = 'globe.gl'
    Object.assign(portalHostElement.style, {
      position: 'fixed',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '1',
      background: 'black',
    })
    document.body.insertBefore(portalHostElement, document.body.firstChild)
    setPortalHost(portalHostElement)

    return () => {
      setPublished(null)
      setPortalHost(null)
      portalHostElement.remove()
    }
  }, [])

  useEffect(() => {
    if (!portalHost || !containerEl) {
      return undefined
    }

    const globe = new Globe(containerEl)
    globeRef.current = globe

    const w = Math.max(1, Math.round(containerEl.clientWidth || 1))
    const h = Math.max(1, Math.round(containerEl.clientHeight || 1))
    globe.width(w).height(h)

    const globeApi = globe as GlobeApi

    globeApi.globeImageUrl(null)
    globeApi.enablePointerInteraction?.(false)
    globeApi.globeMaterial(new MeshLambertMaterial({ color: GLOBE_BASE_COLOR }))
    globe.backgroundColor('#000').showAtmosphere(false).pointOfView({ lat: 0, lng: 0, altitude: 2.5 }, 0)

    setPublished(toSnapshot(globe))

    const resize = () => {
      const w = Math.max(1, Math.round(containerEl.clientWidth || 1))
      const h = Math.max(1, Math.round(containerEl.clientHeight || 1))
      globe.width(w).height(h)
    }

    resize()

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => resize())
    observer?.observe(containerEl)

    return () => {
      observer?.disconnect()
      setPublished(null)
      try {
        const renderer = globe.renderer()
        globe._destructor()
        renderer.dispose()
      } finally {
        globeRef.current = null
      }
    }
  }, [containerEl, portalHost])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return undefined

    if (!worldGeometry || regions.length === 0) {
      globe.hexPolygonsData([])
      return undefined
    }

    const timerId = window.setTimeout(() => {
      if (!globeRef.current) return

      const hexData = buildHexPolygons(regions, scorchedRegions)
      globeRef.current
        .hexPolygonsData(hexData)
        .hexPolygonGeoJsonGeometry('geometry')
        .hexPolygonResolution(3)
        .hexPolygonMargin(hexPolygonMargin())
        .hexPolygonColor((hexPolygon) => {
          const region = unwrapHexPolygonData<HexPolygonInput>(hexPolygon)
          return hexPolygonColor(region)
        })
        .hexPolygonAltitude((hexPolygon) => {
          const region = unwrapHexPolygonData<HexPolygonInput>(hexPolygon)
          return hexPolygonAltitude(region, scorchedRegions)
        })
        .hexPolygonCurvatureResolution(4)
        .hexPolygonUseDots(false)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [regions, scorchedRegions, worldGeometry])

  useEffect(() => {
    const globe = globeRef.current as GlobeApi | null
    if (!globe) {
      return undefined
    }

    globe
      .arcsData(buildArcsData(diplomaticArcs, capitals.length > 0 ? capitals : undefined))
      .arcColor('color')
      .arcStroke('stroke')
      .arcDashLength('dashLength')
      .arcDashGap('dashGap')
      .arcDashAnimateTime('dashAnimateTime')
      // Keep diplomatic arcs close to the globe surface so they read as attached
      // overlays instead of a separate floating ring.
      .arcAltitude(() => ARC_MAX_ALTITUDE)
  }, [capitals, diplomaticArcs])

  useEffect(() => {
    const globe = globeRef.current as GlobeApi | null
    if (!globe) {
      return undefined
    }

    const capitalMarkers = buildPointsData(capitals).map((marker) => ({
      ...marker,
      altitude: 0.035,
      radius: 0.9,
    }))

    globe
      .pointsData(capitalMarkers)
      .pointColor('color')
      .pointRadius('radius')
      .pointAltitude('altitude')
      .pointResolution(12)
  }, [capitals])

  return (
    <GlobeInstanceProvider value={published}>
      {portalHost
        ? createPortal(
            <motion.div
              className="absolute inset-0 overflow-hidden"
              animate={{ scale: zoom }}
              transition={{ duration: transitionMs / 1000, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'center' }}
            >
              <div ref={setContainerEl} className="relative h-full w-full overflow-hidden bg-black">
                {children ? <div className="absolute inset-0">{children}</div> : null}
              </div>
            </motion.div>,
            portalHost,
          )
        : null}
    </GlobeInstanceProvider>
  )
}
