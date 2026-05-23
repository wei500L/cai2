import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Globe from 'globe.gl'
import type { GlobeInstance } from 'globe.gl'
import type { Camera, Scene, WebGLRenderer } from 'three'
import type { MapRegion } from '@/mock/types'
import {
  buildHexPolygons,
  hexPolygonAltitude,
  hexPolygonColor,
  hexPolygonMargin,
} from '@/render/globe/buildHexPolygons'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'
import { GlobeInstanceProvider } from '@/render/globe/GlobeInstanceProvider'
import type { GlobeInstanceSnapshot } from '@/render/globe/globeTypes'

const PRESET_POINTS: Record<'overview' | 'focus' | 'cinematic', { lat: number; lng: number; altitude: number }> = {
  overview: { lat: 0, lng: 0, altitude: 2.5 },
  focus: { lat: 0, lng: 0, altitude: 1.65 },
  cinematic: { lat: 0, lng: 0, altitude: 3.2 },
}

const FOCUS_ALTITUDE: Record<'overview' | 'focus' | 'cinematic', number> = {
  overview: 1.9,
  focus: 1.4,
  cinematic: 2.2,
}

function resolveRegionPoint(region: MapRegion) {
  return {
    lat: region.lat ?? region.centerLatLng[0],
    lng: region.lng ?? region.centerLatLng[1],
  }
}

function unwrapHexPolygonData<T>(hexPolygon: T | { __data?: T }) {
  return (hexPolygon as { __data?: T }).__data ?? hexPolygon
}

function toSnapshot(globe: GlobeInstance): GlobeInstanceSnapshot {
  return {
    globe,
    scene: globe.scene() as Scene,
    camera: globe.camera() as Camera,
    renderer: globe.renderer() as WebGLRenderer,
  }
}

export function MapStageGlobe({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const [published, setPublished] = useState<GlobeInstanceSnapshot | null>(null)
  const cameraPreset = useMapStore((state) => state.cameraPreset)
  const focusRegionId = useMapStore((state) => state.focusRegionId)
  const scorchedRegions = useMapStore((state) => state.scorchedRegions)
  const regions = useGameStore((state) => state.regions)
  const worldGeometry = useGameStore((state) => state.worldGeometry)

  const focusRegion = useMemo(() => {
    if (!focusRegionId) {
      return null
    }

    return regions.find((region) => region.id === focusRegionId) ?? null
  }, [focusRegionId, regions])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }

    const globe = Globe()(container)
    globeRef.current = globe
    globe
      .globeImageUrl(null)
      .backgroundColor('#000')
      .showAtmosphere(false)
      .pointOfView(PRESET_POINTS.overview, 0)
    setPublished(toSnapshot(globe))

    return () => {
      setPublished(null)
      try {
        const renderer = globe.renderer()
        globe._destructor()
        renderer.dispose()
      } finally {
        globeRef.current = null
        container.replaceChildren()
      }
    }
  }, [])

  useEffect(() => {
    const globe = globeRef.current
    const container = containerRef.current
    if (!globe || !container) {
      return undefined
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width || container.clientWidth || 1))
      const height = Math.max(1, Math.round(rect.height || container.clientHeight || 1))
      globe.width(width).height(height)
    }

    resize()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(() => resize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [published])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || focusRegion) {
      return
    }

    globe.pointOfView(PRESET_POINTS[cameraPreset], 0)
  }, [cameraPreset, focusRegion])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !focusRegion) {
      return
    }

    const preset = useMapStore.getState().cameraPreset
    globe.pointOfView(
      {
        ...resolveRegionPoint(focusRegion),
        altitude: FOCUS_ALTITUDE[preset],
      },
      650,
    )
  }, [focusRegion])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !worldGeometry) {
      return
    }

    globe
      .hexPolygonsData(buildHexPolygons(regions, scorchedRegions))
      .hexPolygonGeoJsonGeometry('geometry')
      .hexPolygonResolution(worldGeometry.hex_resolution)
      .hexPolygonColor((hexPolygon) => hexPolygonColor(unwrapHexPolygonData(hexPolygon)))
      .hexPolygonAltitude((hexPolygon) => hexPolygonAltitude(unwrapHexPolygonData(hexPolygon)))
      .hexPolygonMargin(hexPolygonMargin())
      .hexPolygonUseDots(false)
  }, [regions, scorchedRegions, worldGeometry])

  return (
    <GlobeInstanceProvider value={published}>
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
        {children ? <div className="absolute inset-0">{children}</div> : null}
      </div>
    </GlobeInstanceProvider>
  )
}
