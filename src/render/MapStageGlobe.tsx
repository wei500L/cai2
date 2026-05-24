import { useEffect, useRef, useState, type ReactNode } from 'react'
import Globe from 'globe.gl'
import type { GlobeInstance } from 'globe.gl'
import { MeshLambertMaterial, type Camera, type Scene, type WebGLRenderer } from 'three'
import {
  buildHexPolygons,
  hexPolygonAltitude,
  hexPolygonMargin,
  type HexPolygonInput,
} from '@/render/globe/buildHexPolygons'
import { hexPolygonColor } from '@/render/globe/stylePresets'
import { GlobeInstanceProvider } from '@/render/globe/GlobeInstanceProvider'
import type { GlobeInstanceSnapshot } from '@/render/globe/globeTypes'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'

const GLOBE_BASE_COLOR = '#101824'

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

export function MapStageGlobe({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const [published, setPublished] = useState<GlobeInstanceSnapshot | null>(null)

  const regions = useGameStore((state) => state.regions)
  const worldGeometry = useGameStore((state) => state.worldGeometry)
  const scorchedRegions = useMapStore((state) => state.scorchedRegions)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const globe = new Globe(container)
    globeRef.current = globe

    const w = Math.max(1, Math.round(container.clientWidth || 1))
    const h = Math.max(1, Math.round(container.clientHeight || 1))
    globe.width(w).height(h)

    const globeApi = globe as GlobeInstance & {
      globeImageUrl(url: string | null): GlobeInstance
      enablePointerInteraction?: (enabled: boolean) => GlobeInstance
    }

    globeApi.globeImageUrl(null)
    globeApi.enablePointerInteraction?.(false)
    globeApi.globeMaterial(new MeshLambertMaterial({ color: GLOBE_BASE_COLOR }))
    globe.backgroundColor('#000').showAtmosphere(false).pointOfView({ lat: 0, lng: 0, altitude: 2.5 }, 0)

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
    if (!globe || !container) return undefined

    const resize = () => {
      const w = Math.max(1, Math.round(container.clientWidth || 1))
      const h = Math.max(1, Math.round(container.clientHeight || 1))
      globe.width(w).height(h)
    }

    resize()

    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => resize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [published])

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

  return (
    <GlobeInstanceProvider value={published}>
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
        {children ? <div className="absolute inset-0">{children}</div> : null}
      </div>
    </GlobeInstanceProvider>
  )
}
