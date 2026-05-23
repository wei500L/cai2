import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Globe from 'globe.gl'
import type { GlobeInstance } from 'globe.gl'
import { AmbientLight, DirectionalLight, type Camera, type Scene, type WebGLRenderer } from 'three'
import type { MapRegion } from '@/types'
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
import { createSmokeColumn, type SmokeColumnInput } from '@/render/globe/smokeColumn'
import { useFxLoop } from '@/render/globe/fxLoop'
import { globeQualityPresets, hexPolygonColor } from '@/render/globe/stylePresets'
import { GlobeInstanceProvider } from '@/render/globe/GlobeInstanceProvider'
import type { GlobeInstanceSnapshot } from '@/render/globe/globeTypes'
import { useGameStore } from '@/store/gameStore'
import { useMapStore } from '@/store/mapStore'
import { useUIStore } from '@/store/uiStore'

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

function sampleRegionsForQuality(regions: MapRegion[], maxCells: number) {
  if (regions.length <= maxCells) {
    return regions
  }

  const sampled: MapRegion[] = []
  const step = regions.length / maxCells
  for (let index = 0; index < maxCells; index += 1) {
    const region = regions[Math.floor(index * step)]
    if (region) {
      sampled.push(region)
    }
  }
  return sampled
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
  const smokeColumnRef = useRef<ReturnType<typeof createSmokeColumn> | null>(null)
  const bloomComposerRef = useRef<MoonComposer | null>(null)
  const composerTargetRef = useRef<ComposerBridge | null>(null)
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
  const mapQuality = useUIStore((state) => state.mapQuality)
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
  const qualityPreset = globeQualityPresets[mapQuality]
  const renderRegions = useMemo(
    () => sampleRegionsForQuality(regions, qualityPreset.renderCellBudget),
    [regions, qualityPreset.renderCellBudget],
  )
  const fxLoop = useFxLoop(
    published?.globe ?? null,
    {
      onFrame: useCallback((dtMs: number) => {
        directorRef.current?.tick(dtMs)
        smokeColumnRef.current?.update(dtMs)
        if (starfieldRef.current) {
          starfieldRef.current.rotation.y += dtMs * 0.000006
        }
      }, []),
    },
  )

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return undefined
    }

    const target = window as typeof window & {
      __DIPLOMACY_GLOBE_METRICS__?: {
        activeExplosionHandles: () => number
        activeSmokeColumns: () => number
        quality: () => string
        rendererInfo: () => {
          drawCalls: number
          triangles: number
          geometries: number
          textures: number
        }
      }
    }
    target.__DIPLOMACY_GLOBE_METRICS__ = {
      activeExplosionHandles: () => fxLoop.activeCount(),
      activeSmokeColumns: () => smokeColumnRef.current?.activeCount() ?? 0,
      quality: () => useUIStore.getState().mapQuality,
      rendererInfo: () => {
        const renderer = globeRef.current?.renderer() as WebGLRenderer | undefined
        return {
          drawCalls: renderer?.info.render.calls ?? 0,
          triangles: renderer?.info.render.triangles ?? 0,
          geometries: renderer?.info.memory.geometries ?? 0,
          textures: renderer?.info.memory.textures ?? 0,
        }
      },
    }

    return () => {
      if (target.__DIPLOMACY_GLOBE_METRICS__?.activeExplosionHandles() === fxLoop.activeCount()) {
        delete target.__DIPLOMACY_GLOBE_METRICS__
      }
    }
  }, [fxLoop])

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
      enablePointerInteraction?: (enabled: boolean) => GlobeInstance
    }

    globeApi.globeImageUrl(null)
    globeApi.enablePointerInteraction?.(false)
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

    const initialPreset = globeQualityPresets[useUIStore.getState().mapQuality]
    const initialLighting = useMapStore.getState().lighting
    renderer.setPixelRatio(
      Math.max(0.5, (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) * initialPreset.renderScale),
    )
    const bloomRig = setupBloom(renderer, scene, camera, {
      strength: initialPreset.bloomEnabled ? initialPreset.bloomStrength : 0,
      mipmapBlur: initialPreset.bloomMipmapBlur,
      radius: initialPreset.bloomRadius,
      threshold: initialPreset.bloomThreshold,
      vignetteDarkness: 0,
      noiseOpacity: 0,
      noiseEnabled: initialLighting.noiseEnabled,
    })
    ;(bloomRig.composer as MoonComposer & { setPixelRatio?: (value: number) => void }).setPixelRatio?.(
      Math.max(0.5, (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) * initialPreset.renderScale),
    )
    bloomComposerRef.current = bloomRig.composer
    composerTargetRef.current = globe.postProcessingComposer() as unknown as ComposerBridge
    if (initialPreset.bloomPostprocessEnabled) {
      composerBridgeRef.current = bindComposerBridge(composerTargetRef.current, bloomRig.composer)
    }

    setPublished(toSnapshot(globe))

    return () => {
      setPublished(null)
      composerBridgeRef.current?.restore()
      bloomComposerRef.current?.dispose()
      disposeStarfield(starfieldRef.current)
      smokeColumnRef.current?.dispose()
      starfieldRef.current = null
      smokeColumnRef.current = null
      bloomComposerRef.current = null
      composerTargetRef.current = null
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
      cinematicEnabled: true,
      mode: globeQualityPresets[useUIStore.getState().mapQuality].cinematicMode,
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
    directorRef.current?.setEnabled(mapQuality === 'high' ? cinematicEnabled : true)
    directorRef.current?.setMode(qualityPreset.cinematicMode)
  }, [cinematicEnabled, mapQuality, qualityPreset.cinematicMode])

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
    const starfield = createStarfield(globe.scene() as Scene, qualityPreset.starfieldDensity)
    starfieldRef.current = starfield

    return () => {
      if (starfieldRef.current === starfield) {
        starfieldRef.current = null
      }
      disposeStarfield(starfield)
    }
  }, [qualityPreset.starfieldDensity])

  useEffect(() => {
    useMapStore.getState().setLighting({
      bloomStrength: qualityPreset.bloomEnabled ? qualityPreset.bloomStrength : 0,
      bloomRadius: qualityPreset.bloomRadius,
      bloomThreshold: qualityPreset.bloomThreshold,
      starfieldDensity: qualityPreset.starfieldDensity,
    })
    useMapStore.getState().setCinematicEnabled(mapQuality === 'high')

    const globe = globeRef.current
    if (globe) {
      const renderer = globe.renderer() as WebGLRenderer
      const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
      const pixelRatio = Math.max(0.5, devicePixelRatio * qualityPreset.renderScale)
      renderer.setPixelRatio(pixelRatio)
      const composer = bloomComposerRef.current as (MoonComposer & { setPixelRatio?: (value: number) => void }) | null
      if (composer?.setPixelRatio) {
        composer.setPixelRatio(pixelRatio)
      }
      if (composer && containerRef.current) {
        const width = containerRef.current.clientWidth || 1
        const height = containerRef.current.clientHeight || 1
        composer.setSize(Math.max(1, width), Math.max(1, height))
      }
    }
  }, [mapQuality, qualityPreset])

  useEffect(() => {
    if (!published?.scene) {
      return undefined
    }

    const smokeColumn = createSmokeColumn(published.scene)
    smokeColumnRef.current = smokeColumn

    return () => {
      if (smokeColumnRef.current === smokeColumn) {
        smokeColumnRef.current = null
      }
      smokeColumn.dispose()
    }
  }, [published?.scene])

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
      fxLoop.add(spawnExplosion(published.scene, event, {
        particleMultiplier: qualityPreset.particleMultiplier,
      }))
      consumeExplosion(event.id)
    }
  }, [consumeExplosion, explosionQueue, fxLoop, published?.scene, currentRoomId, qualityPreset.particleMultiplier])

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
    const composerTarget = composerTargetRef.current
    if (!composer) {
      return
    }

    if (qualityPreset.bloomPostprocessEnabled && composerTarget && !composerBridgeRef.current) {
      composerBridgeRef.current = bindComposerBridge(composerTarget, composer)
    } else if (!qualityPreset.bloomPostprocessEnabled && composerBridgeRef.current) {
      composerBridgeRef.current.restore()
      composerBridgeRef.current = null
    }

    const effects = composer.__moonEffects
    effects.bloom.intensity = qualityPreset.bloomEnabled ? qualityPreset.bloomStrength : 0
    effects.bloom.mipmapBlurPass.radius = qualityPreset.bloomRadius
    effects.bloom.luminanceMaterial.threshold = qualityPreset.bloomThreshold
    if (effects.noise) {
      effects.noise.blendMode.opacity.value = lighting.noiseEnabled ? 0.06 : 0
    }
  }, [
    qualityPreset.bloomEnabled,
    qualityPreset.bloomPostprocessEnabled,
    qualityPreset.bloomStrength,
    qualityPreset.bloomRadius,
    qualityPreset.bloomThreshold,
    lighting.noiseEnabled,
  ])

  useEffect(() => {
    const smokeColumn = smokeColumnRef.current
    if (!smokeColumn) {
      return
    }

    if (!qualityPreset.smokeColumnEnabled) {
      smokeColumn.sync([])
      return
    }

    const regionById = new Map<string, MapRegion>()
    for (const region of renderRegions) {
      regionById.set(region.id, region)
      if (region.hex_id) {
        regionById.set(region.hex_id, region)
      }
    }

    const entries: SmokeColumnInput[] = []
    for (const [hexId, entry] of scorchedRegions.entries()) {
      const region = regionById.get(hexId)
      if (!region) {
        continue
      }

      entries.push({
        hexId,
        lat: region.lat ?? region.centerLatLng[0],
        lng: region.lng ?? region.centerLatLng[1],
        severity: entry.severity,
        fallout: entry.fallout,
        ttlTurns: entry.ttl_turns,
        sinceTurn: entry.since_turn,
      })
    }

    smokeColumn.sync(entries)
  }, [qualityPreset.smokeColumnEnabled, renderRegions, scorchedRegions])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !worldGeometry) {
      return
    }

    const scorchedLookup = scorchedRegions

    globe
      .hexPolygonsData(buildHexPolygons(renderRegions, scorchedRegions))
      .hexPolygonGeoJsonGeometry('geometry')
      .hexPolygonResolution(qualityPreset.hexResolution)
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
        return Number((hexPolygonAltitude(region, scorchedLookup) * qualityPreset.hexAltitudeScale).toFixed(4))
      })
      .hexPolygonMargin(hexPolygonMargin())
      .hexPolygonUseDots(false)
  }, [
    renderRegions,
    scorchedRegions,
    worldGeometry,
    lighting.dayNightMaskAlpha,
    qualityPreset.hexResolution,
    qualityPreset.hexAltitudeScale,
  ])

  return (
    <GlobeInstanceProvider value={published}>
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
        {children ? <div className="absolute inset-0">{children}</div> : null}
      </div>
    </GlobeInstanceProvider>
  )
}
