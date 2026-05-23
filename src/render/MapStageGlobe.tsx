import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Globe from 'globe.gl'
import type { GlobeInstance } from 'globe.gl'
import { AmbientLight, DirectionalLight, type Camera, type Scene, type WebGLRenderer } from 'three'
import type { MapRegion } from '@/mock/types'
import {
  buildHexPolygons,
  type HexPolygonInput,
  hexPolygonAltitude,
  hexPolygonMargin,
} from '@/render/globe/buildHexPolygons'
import { bindComposerBridge, setupBloom, type ComposerBridge, type MoonComposer } from '@/render/globe/postprocess'
import { createStarfield, disposeStarfield } from '@/render/globe/starfield'
import { CameraDirector, type SpeechCameraEvent } from '@/render/globe/cameraDirector'
import { spawnExplosion } from '@/render/globe/explosionFx'
import { useFxLoop } from '@/render/globe/fxLoop'
import { hexPolygonColor } from '@/render/globe/stylePresets'
import { GlobeInstanceProvider } from '@/render/globe/GlobeInstanceProvider'
import type { GlobeInstanceSnapshot } from '@/render/globe/globeTypes'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'

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

function unwrapHexPolygonData<T>(hexPolygon: T | { __data?: T }): T {
  return (((hexPolygon as { __data?: T }).__data ?? hexPolygon) as T)
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
  const starfieldRef = useRef<ReturnType<typeof createStarfield> | null>(null)
  const bloomComposerRef = useRef<MoonComposer | null>(null)
  const composerBridgeRef = useRef<ReturnType<typeof bindComposerBridge> | null>(null)
  const directorRef = useRef<CameraDirector | null>(null)
  const seenExplosionIdsRef = useRef<Set<string>>(new Set())
  const seenResolveEventIdsRef = useRef<Set<string>>(new Set())
  const seenExplosionRoomIdRef = useRef<string | null>(null)
  const seenResolveRoomIdRef = useRef<string | null>(null)
  const [published, setPublished] = useState<GlobeInstanceSnapshot | null>(null)
  const cameraPreset = useMapStore((state) => state.cameraPreset)
  const focusRegionId = useMapStore((state) => state.focusRegionId)
  const cinematicEnabled = useMapStore((state) => state.cinematicEnabled)
  const reducedMotion = useMapStore((state) => state.reducedMotion)
  const scorchedRegions = useMapStore((state) => state.scorchedRegions)
  const lighting = useMapStore((state) => state.lighting)
  const explosionQueue = useMapStore((state) => state.explosionQueue)
  const consumeExplosion = useMapStore((state) => state.consumeExplosion)
  const regions = useGameStore((state) => state.regions)
  const events = useGameStore((state) => state.events)
  const currentRoomId = useGameStore((state) => state.currentRoomId)
  const worldGeometry = useGameStore((state) => state.worldGeometry)
  const speakerCapitalByFaction = useMemo(() => {
    const capitalMap = new Map<string, { lat: number; lng: number }>()
    if (!worldGeometry) {
      return capitalMap
    }

    for (const capital of worldGeometry.factions) {
      capitalMap.set(capital.id, {
        lat: capital.capital_lat,
        lng: capital.capital_lng,
      })
    }

    return capitalMap
  }, [worldGeometry])
  const fxLoop = useFxLoop(
    published?.globe ?? null,
    {
      onFrame: useCallback((dtMs: number) => {
        directorRef.current?.tick(dtMs)
        if (starfieldRef.current) {
          starfieldRef.current.rotation.y += dtMs * 0.000006
        }
      }, []),
    },
  )

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

    const globe = new Globe(container)
    globeRef.current = globe
    const scene = globe.scene() as Scene
    const camera = globe.camera() as Camera
    const renderer = globe.renderer() as WebGLRenderer
    const globeApi = globe as GlobeInstance & {
      globeImageUrl(url: string | null): GlobeInstance
      showGraticules?: (enabled: boolean) => GlobeInstance
    }

    globeApi.globeImageUrl(null)
    globe
      .backgroundColor('#000')
      .showAtmosphere(false)
      .pointOfView(PRESET_POINTS.overview, 0)
    globeApi.showGraticules?.(false)

    const ambientLight = new AmbientLight('#09111c', 0.18)
    const sunLight = new DirectionalLight('#f2e5c0', 1.25)
    const sunLat = (10 * Math.PI) / 180
    const sunLng = 0
    sunLight.position.set(
      Math.cos(sunLat) * Math.cos(sunLng) * 900,
      Math.sin(sunLat) * 900,
      Math.cos(sunLat) * Math.sin(sunLng) * 900,
    )
    scene.add(ambientLight)
    scene.add(sunLight)

    const initialLighting = useMapStore.getState().lighting
    const bloomRig = setupBloom(renderer, scene, camera, {
      strength: initialLighting.bloomStrength,
      radius: initialLighting.bloomRadius,
      threshold: initialLighting.bloomThreshold,
      vignetteDarkness: 0.6,
      noiseOpacity: 0.06,
      noiseEnabled: initialLighting.noiseEnabled,
    })
    bloomComposerRef.current = bloomRig.composer
    composerBridgeRef.current = bindComposerBridge(
      globe.postProcessingComposer() as unknown as ComposerBridge,
      bloomRig.composer,
    )

    setPublished(toSnapshot(globe))

    return () => {
      setPublished(null)
      composerBridgeRef.current?.restore()
      bloomComposerRef.current?.dispose()
      disposeStarfield(starfieldRef.current)
      starfieldRef.current = null
      bloomComposerRef.current = null
      composerBridgeRef.current = null
      try {
        const rendererInstance = globe.renderer()
        globe._destructor()
        rendererInstance.dispose()
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
    if (!globe) {
      return undefined
    }

    const state = useMapStore.getState()
    const director = new CameraDirector(globe, {
      cinematicEnabled: state.cinematicEnabled,
      reducedMotion: state.reducedMotion,
    })
    directorRef.current = director

    return () => {
      if (directorRef.current === director) {
        directorRef.current = null
      }
      director.dispose()
    }
  }, [published?.globe])

  useEffect(() => {
    directorRef.current?.setEnabled(cinematicEnabled)
  }, [cinematicEnabled])

  useEffect(() => {
    directorRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !directorRef.current || directorRef.current.isActive() || focusRegion) {
      return
    }

    globe.pointOfView(PRESET_POINTS[cameraPreset], 0)
  }, [cameraPreset, focusRegion, published?.globe])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !directorRef.current || directorRef.current.isActive() || !focusRegion) {
      return
    }

    const preset = useMapStore.getState().cameraPreset
    globe.pointOfView(
      {
        ...resolveRegionPoint(focusRegion),
        altitude: FOCUS_ALTITUDE[preset],
      },
      0,
    )
  }, [focusRegion, published?.globe])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) {
      return undefined
    }

    disposeStarfield(starfieldRef.current)
    const starfield = createStarfield(globe.scene() as Scene, lighting.starfieldDensity)
    starfieldRef.current = starfield

    return () => {
      if (starfieldRef.current === starfield) {
        starfieldRef.current = null
      }
      disposeStarfield(starfield)
    }
  }, [lighting.starfieldDensity])

  useEffect(() => {
    const director = directorRef.current
    if (!published?.scene || explosionQueue.length === 0 || !director) {
      return
    }

    if (seenExplosionRoomIdRef.current !== currentRoomId) {
      seenExplosionRoomIdRef.current = currentRoomId
      seenExplosionIdsRef.current.clear()
    }

    for (const event of explosionQueue) {
      if (!seenExplosionIdsRef.current.has(event.id)) {
        director.onResolveEvent(event)
        seenExplosionIdsRef.current.add(event.id)
      }
      fxLoop.add(spawnExplosion(published.scene, event))
      consumeExplosion(event.id)
    }
  }, [consumeExplosion, explosionQueue, fxLoop, published?.scene, currentRoomId])

  useEffect(() => {
    const director = directorRef.current
    if (!director || events.length === 0) {
      return
    }

    if (seenResolveRoomIdRef.current !== currentRoomId) {
      seenResolveRoomIdRef.current = currentRoomId
      seenResolveEventIdsRef.current.clear()
    }

    if (seenResolveEventIdsRef.current.size === 0) {
      for (const event of events) {
        seenResolveEventIdsRef.current.add(event.id)
      }
      return
    }

    for (const event of events) {
      if (seenResolveEventIdsRef.current.has(event.id)) {
        continue
      }

      seenResolveEventIdsRef.current.add(event.id)
      if (event.kind !== 'speech' || event.priority !== 'P0' || !event.actor) {
        continue
      }

      const speakerCapital = speakerCapitalByFaction.get(event.actor)
      if (!speakerCapital) {
        continue
      }

      director.onResolveEvent({
        ...event,
        speakerCapital,
      } as SpeechCameraEvent)
    }
  }, [events, speakerCapitalByFaction, currentRoomId, published?.globe])

  useEffect(() => {
    const composer = bloomComposerRef.current
    if (!composer) {
      return
    }

    const effects = composer.__moonEffects
    effects.bloom.intensity = lighting.bloomStrength
    effects.bloom.mipmapBlurPass.radius = lighting.bloomRadius
    effects.bloom.luminanceMaterial.threshold = lighting.bloomThreshold
    effects.noise.blendMode.opacity.value = lighting.noiseEnabled ? 0.06 : 0
  }, [lighting.bloomStrength, lighting.bloomRadius, lighting.bloomThreshold, lighting.noiseEnabled])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !worldGeometry) {
      return
    }

    const scorchedLookup = scorchedRegions

    globe
      .hexPolygonsData(buildHexPolygons(regions, scorchedRegions))
      .hexPolygonGeoJsonGeometry('geometry')
      .hexPolygonResolution(worldGeometry.hex_resolution)
      .hexPolygonColor((hexPolygon) => {
        const region = unwrapHexPolygonData<HexPolygonInput>(hexPolygon)
        const scorchedEntry = scorchedLookup.get(region.hexId) ?? scorchedLookup.get(region.regionId)
        return hexPolygonColor(region, {
          sunLat: 10,
          sunLng: 0,
          nightMaskAlpha: lighting.dayNightMaskAlpha,
          scorchedEntry: scorchedEntry ?? null,
        })
      })
      .hexPolygonAltitude((hexPolygon) => {
        const region = unwrapHexPolygonData<HexPolygonInput>(hexPolygon)
        return hexPolygonAltitude(region, scorchedLookup)
      })
      .hexPolygonMargin(hexPolygonMargin())
      .hexPolygonUseDots(false)
  }, [regions, scorchedRegions, worldGeometry, lighting.dayNightMaskAlpha])

  return (
    <GlobeInstanceProvider value={published}>
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
        {children ? <div className="absolute inset-0">{children}</div> : null}
      </div>
    </GlobeInstanceProvider>
  )
}
