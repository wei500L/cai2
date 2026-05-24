import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  type Group,
} from 'three'
import { factionIds, factionTokens } from '@/components/hudTheme'
import { factionMetaStore } from '@/store/factionMetaStore'
import type { FactionId } from '@/types/faction'
import { gameStoreApi, useGameStore } from '@/store/gameStore'
import { useUIStore, type MapQuality } from '@/store/uiStore'
import type { BorderTensionEntry, RegionTransitionLogEntry } from '@/protocol/types'

type PaletteEntry = {
  primary: string
  glow: string
}

type Palette = Record<FactionId, PaletteEntry>

type RegionNode = {
  id: string
  position: [number, number, number]
  owner: FactionId | null
  color: string
  targetColor: string
  scale: number
}

type BorderSegment = {
  start: [number, number, number]
  end: [number, number, number]
  visualState: BorderTensionEntry['visual_state']
  tension: number
}

type LightNode = {
  position: [number, number, number]
  color: string
  scale: number
}

type ParticleNode = {
  position: [number, number, number]
  velocity: [number, number, number]
  size: number
  seed: number
}

type SceneData = {
  regions: RegionNode[]
  borders: BorderSegment[]
  lights: LightNode[]
  particles: ParticleNode[]
  inflows: Array<{
    id: string
    position: [number, number, number]
    color: string
    direction: string
    speed: number
    particles: 'aggressive' | 'neutral'
    startedAt: number
  }>
  particleCount: number
}

const qualityConfig: Record<MapQuality, { particleLimit: number; particleStride: number }> = {
  low: { particleLimit: 2_000, particleStride: 3 },
  mid: { particleLimit: 4_000, particleStride: 3 },
  high: { particleLimit: 8_000, particleStride: 2 },
}

function compactDefined<T>(value: readonly (T | null | undefined)[] | null | undefined): T[]
function compactDefined(value: unknown): unknown[]
function compactDefined(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: unknown[] = []
  for (const item of value) {
    if (item != null) {
      items.push(item)
    }
  }

  return items
}

const borderStyle: Record<
  BorderTensionEntry['visual_state'],
  { color: string; glow: string; width: number; glowWidth: number; opacity: number; glowOpacity: number }
> = {
  calm: {
    color: '#76b7ff',
    glow: '#76b7ff',
    width: 1.1,
    glowWidth: 3.4,
    opacity: 0.18,
    glowOpacity: 0.06,
  },
  watch: {
    color: '#90b7ff',
    glow: '#90b7ff',
    width: 1.35,
    glowWidth: 3.8,
    opacity: 0.24,
    glowOpacity: 0.08,
  },
  tense: {
    color: '#ffd76b',
    glow: '#ffd76b',
    width: 1.55,
    glowWidth: 4.2,
    opacity: 0.28,
    glowOpacity: 0.1,
  },
  critical: {
    color: '#ff6b82',
    glow: '#ff6b82',
    width: 2.2,
    glowWidth: 5.5,
    opacity: 0.54,
    glowOpacity: 0.2,
  },
  hostile_sparking: {
    color: '#ff8a68',
    glow: '#ff8a68',
    width: 1.95,
    glowWidth: 5,
    opacity: 0.42,
    glowOpacity: 0.16,
  },
  war_frontline: {
    color: '#ff4f6d',
    glow: '#ff4f6d',
    width: 2.55,
    glowWidth: 6.2,
    opacity: 0.62,
    glowOpacity: 0.22,
  },
}

function hash01(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return ((hash >>> 0) % 10_000) / 10_000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveCssColor(token: string, styles: CSSStyleDeclaration) {
  const match = token.match(/^var\((--[^)]+)\)$/)
  return match ? styles.getPropertyValue(match[1]).trim() : token
}

function buildPalette(): Palette {
  const styles = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    factionIds.map((id) => {
      const meta = factionMetaStore.getState().byId[id]
      const token = meta ?? factionTokens[id]
      return [
        id,
        {
          primary: resolveCssColor(token.primary, styles),
          glow: resolveCssColor(token.glow, styles),
        },
      ]
    }),
  ) as Palette
}

function latLngToUnitVector(latLng: [number, number]): [number, number, number] {
  const lat = (latLng[0] * Math.PI) / 180
  const lng = (latLng[1] * Math.PI) / 180
  const cosLat = Math.cos(lat)
  return [cosLat * Math.cos(lng), Math.sin(lat), cosLat * Math.sin(lng)]
}

function scaleVector(vector: [number, number, number], scale: number): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale]
}

function addVector(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

function normalizeVector(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function randomUnitVector(seed: string): [number, number, number] {
  const theta = hash01(`${seed}:theta`) * Math.PI * 2
  const z = hash01(`${seed}:z`) * 2 - 1
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return [r * Math.cos(theta), z, r * Math.sin(theta)]
}

function createTangentOffset(
  base: [number, number, number],
  seed: string,
  amplitude: number,
): [number, number, number] {
  const random = randomUnitVector(seed)
  const radial = normalizeVector(base)
  const projection = radial[0] * random[0] + radial[1] * random[1] + radial[2] * random[2]
  const tangent = normalizeVector([
    random[0] - radial[0] * projection,
    random[1] - radial[1] * projection,
    random[2] - radial[2] * projection,
  ])
  return scaleVector(tangent, amplitude)
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join(':')
}

function buildSceneData(state = gameStoreApi.getState(), quality: MapQuality): SceneData {
  const palette = buildPalette()
  const regions = compactDefined(state.regions)
  const borderMap = state.borderTensionMap

  if (regions.length === 0) {
    return {
      regions: [],
      borders: [],
      lights: [],
      particles: [],
      inflows: [],
      particleCount: 0,
    }
  }

  const transitionMap = new Map<string, RegionTransitionLogEntry>()
  for (const entry of state.regionTransitionLog) {
    if (!transitionMap.has(entry.region_id)) {
      transitionMap.set(entry.region_id, entry)
    }
  }
  const regionNodes: RegionNode[] = []
  const lightNodes: LightNode[] = []
  const borderNodes: BorderSegment[] = []
  const particleNodes: ParticleNode[] = []

  for (const region of regions) {
    const basePosition = latLngToUnitVector(region.centerLatLng)
    const owner = region.owner
    const paletteEntry = owner ? palette[owner] : null
    const transition = transitionMap.get(region.id)
    const previousColor = transition?.prev_owner ? palette[transition.prev_owner].primary : paletteEntry?.primary
    const strength = clamp(0.35 + region.developmentLevel * 0.65, 0.35, 1)
    regionNodes.push({
      id: region.id,
      position: basePosition,
      owner,
      color: previousColor ?? '#7f97bd',
      targetColor: paletteEntry?.primary ?? '#7f97bd',
      scale: 0.05 + strength * 0.035,
    })

    const lightCount = Math.max(1, Math.min(5, Math.round(region.developmentLevel * 4) || 1))
    for (let index = 0; index < lightCount; index += 1) {
      const offset = createTangentOffset(
        basePosition,
        `${region.id}:light:${index}`,
        0.045 + hash01(`${region.id}:light:${index}:amp`) * 0.09,
      )
      const lightPosition = normalizeVector(addVector(basePosition, offset))
      lightNodes.push({
        position: lightPosition,
        color: paletteEntry?.glow ?? '#8fcaff',
        scale: 0.018 + hash01(`${region.id}:light:${index}:scale`) * 0.02,
      })
    }
  }

  const regionsById = new Map(regions.map((region) => [region.id, region]))
  const seenBorderPairs = new Set<string>()
  for (const region of regions) {
    if (region.owner === null) {
      continue
    }

    for (const neighborId of region.neighbors) {
      const neighbor = regionsById.get(neighborId)
      if (!neighbor || neighbor.owner === null || neighbor.owner === region.owner) {
        continue
      }

      const key = pairKey(region.id, neighbor.id)
      if (seenBorderPairs.has(key)) {
        continue
      }
      seenBorderPairs.add(key)

      const pair = pairKey(region.owner, neighbor.owner)
      const border = borderMap[pair]
      borderNodes.push({
        start: latLngToUnitVector(region.centerLatLng),
        end: latLngToUnitVector(neighbor.centerLatLng),
        visualState: border?.visual_state ?? 'calm',
        tension: border?.tension ?? 0,
      })
    }
  }

  const inflows = state.regionTransitionLog.map((entry) => {
    const region = state.regions.find((item) => item.id === entry.region_id)
    const owner = entry.new_owner
    return {
      id: entry.id,
      position: region ? latLngToUnitVector(region.centerLatLng) : ([0, 0, 1] as [number, number, number]),
      color: owner ? palette[owner].glow : '#8fcaff',
      direction: entry.animation_params.direction,
      speed: entry.animation_params.speed,
      particles: entry.animation_params.particles,
      startedAt: entry.started_at,
    }
  })

  const limit = qualityConfig[quality].particleLimit
  const particleCount = Math.min(
    limit,
    Math.max(Math.round(limit * 0.72), regions.length * 72),
  )
  for (let index = 0; index < particleCount; index += 1) {
    const region = regions[index % regions.length]
    const basePosition = latLngToUnitVector(region.centerLatLng)
    const seed = `${region.id}:particle:${index}`
    const position = normalizeVector(
      addVector(
        basePosition,
        scaleVector(
          randomUnitVector(`${seed}:position`),
          0.08 + hash01(`${seed}:radius`) * 0.12,
        ),
      ),
    )
    particleNodes.push({
      position,
      velocity: normalizeVector(randomUnitVector(`${seed}:velocity`)),
      size: 0.45 + hash01(`${seed}:size`) * 0.85,
      seed: hash01(`${seed}:seed`),
    })
  }

  return {
    regions: regionNodes,
    borders: borderNodes,
    lights: lightNodes,
    particles: particleNodes,
    inflows,
    particleCount,
  }
}

function BorderLineGroup({
  segments,
  radius,
  state,
  glow,
}: {
  segments: BorderSegment[]
  radius: number
  state: BorderTensionEntry['visual_state']
  glow: boolean
}) {
  const style = borderStyle[state]

  const geometry = useMemo(() => {
    const positions = segments.flatMap((segment) => [
      segment.start[0] * radius,
      segment.start[1] * radius,
      segment.start[2] * radius,
      segment.end[0] * radius,
      segment.end[1] * radius,
      segment.end[2] * radius,
    ])
    const nextGeometry = new BufferGeometry()
    nextGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return nextGeometry
  }, [radius, segments])

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(glow ? style.glow : style.color),
        linewidth: glow ? style.glowWidth : style.width,
        transparent: true,
        opacity: glow ? style.glowOpacity : style.opacity,
        depthWrite: false,
        depthTest: true,
        ...(glow ? { blending: AdditiveBlending } : {}),
      }),
    [glow, style.color, style.glow, style.glowOpacity, style.glowWidth, style.opacity, style.width],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  return <lineSegments geometry={geometry} material={material} />
}

function BorderLayer({ borders, radius }: { borders: BorderSegment[]; radius: number }) {
  const grouped = useMemo(() => {
    return borders.reduce<Record<BorderTensionEntry['visual_state'], BorderSegment[]>>(
      (next, border) => {
        next[border.visualState].push(border)
        return next
      },
      {
        calm: [],
        watch: [],
        tense: [],
        critical: [],
        hostile_sparking: [],
        war_frontline: [],
      },
    )
  }, [borders])

  return (
    <group>
      {(Object.keys(grouped) as BorderTensionEntry['visual_state'][]).map((state) =>
        grouped[state].length > 0 ? (
          <group key={state}>
            <BorderLineGroup segments={grouped[state]} radius={radius * 1.01} state={state} glow />
            <BorderLineGroup segments={grouped[state]} radius={radius * 1.01} state={state} glow={false} />
          </group>
        ) : null,
      )}
    </group>
  )
}

function RegionLayer({ regions, radius }: { regions: RegionNode[]; radius: number }) {
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.96,
        vertexColors: true,
      }),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    mesh.count = regions.length
    regions.forEach((region, index) => {
      dummy.position.set(
        region.position[0] * radius * 1.01,
        region.position[1] * radius * 1.01,
        region.position[2] * radius * 1.01,
      )
      dummy.scale.setScalar(radius * region.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [dummy, radius, regions])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !mesh.instanceColor) {
      return
    }

    regions.forEach((region, index) => {
      const target = new Color(region.targetColor)
      const current = new Color(region.color)
      current.lerp(target, 0.06)
      region.color = `#${current.getHexString()}`
      mesh.setColorAt(index, current)
    })
    mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, Math.max(regions.length, 1)]} />
}

function RegionInflowLayer({
  inflows,
  radius,
}: {
  inflows: SceneData['inflows']
  radius: number
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => new SphereGeometry(1, 10, 10), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
        vertexColors: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    mesh.count = inflows.length
    inflows.forEach((flow, index) => {
      dummy.position.set(
        flow.position[0] * radius * 1.045,
        flow.position[1] * radius * 1.045,
        flow.position[2] * radius * 1.045,
      )
      dummy.scale.setScalar(radius * 0.028)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, new Color(flow.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [dummy, inflows, radius])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    const now = clock.getElapsedTime() * 1000
    let activeCount = 0
    inflows.forEach((flow) => {
      const age = now - flow.startedAt
      const progress = clamp(age / (1200 / Math.max(flow.speed, 0.8)), 0, 1)
      if (progress >= 1) {
        return
      }

      const direction =
        flow.direction === 'east_to_west' || flow.direction === 'west_to_east' ? 1 : -1
      const vertical = flow.direction === 'south_to_north' || flow.direction === 'north_to_south'
      dummy.position.set(
        flow.position[0] * radius * 1.045 + (vertical ? 0 : direction * progress * radius * 0.08),
        flow.position[1] * radius * 1.045 + (vertical ? direction * progress * radius * 0.08 : 0),
        flow.position[2] * radius * 1.045,
      )
      dummy.scale.setScalar(
        radius * (flow.particles === 'aggressive' ? 0.025 : 0.02) * (1 + progress * 1.1),
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(activeCount, dummy.matrix)
      mesh.setColorAt(activeCount, new Color(flow.color))
      activeCount += 1
    })

    mesh.count = Math.max(activeCount, 0)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, Math.max(inflows.length, 1)]} />
}

function CityLightLayer({ lights, radius }: { lights: LightNode[]; radius: number }) {
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => new SphereGeometry(1, 6, 6), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.96,
        vertexColors: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    mesh.count = lights.length
    lights.forEach((light, index) => {
      dummy.position.set(
        light.position[0] * radius * 1.03,
        light.position[1] * radius * 1.03,
        light.position[2] * radius * 1.03,
      )
      dummy.scale.setScalar(radius * light.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, new Color(light.color))
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [dummy, lights, radius])

  return <instancedMesh ref={meshRef} args={[geometry, material, Math.max(lights.length, 1)]} />
}

function ParticleLayer({
  particles,
  radius,
  quality,
}: {
  particles: ParticleNode[]
  radius: number
  quality: MapQuality
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => {
    const base = new IcosahedronGeometry(0.04, 0)
    const seeds = new Float32Array(particles.length)
    const velocities = new Float32Array(particles.length * 3)
    const sizes = new Float32Array(particles.length)

    particles.forEach((particle, index) => {
      seeds[index] = particle.seed
      velocities[index * 3 + 0] = particle.velocity[0]
      velocities[index * 3 + 1] = particle.velocity[1]
      velocities[index * 3 + 2] = particle.velocity[2]
      sizes[index] = particle.size
    })

    base.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    base.setAttribute('aVelocity', new InstancedBufferAttribute(velocities, 3))
    base.setAttribute('aSize', new InstancedBufferAttribute(sizes, 1))
    return base
  }, [particles])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color('#93d9ff') },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        side: DoubleSide,
        vertexShader: `
          uniform float uTime;
          attribute float aSeed;
          attribute vec3 aVelocity;
          attribute float aSize;
          varying float vAlpha;
          varying float vPulse;

          float hash(float n) {
            return fract(sin(n) * 43758.5453123);
          }

          float noise(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            float n = p.x + p.y * 57.0 + p.z * 113.0;
            float res = mix(
              mix(mix(hash(n + 0.0), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
              mix(mix(hash(n + 113.0), hash(n + 114.0), f.x), mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
              f.z
            );
            return res;
          }

          float fbm(vec3 x) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int index = 0; index < 4; index++) {
              value += amplitude * noise(x);
              x = x * 2.03 + vec3(1.7, 9.2, 4.5);
              amplitude *= 0.5;
            }
            return value;
          }

          void main() {
            vec3 transformed = position * aSize;
            vec4 world = instanceMatrix * vec4(transformed, 1.0);
            float wave = fbm(world.xyz * 0.38 + vec3(uTime * 0.16, aSeed * 9.0, uTime * 0.08));
            vec3 wobble = normalize(aVelocity) * (wave - 0.5) * (0.12 + aSize * 0.08);
            world.xyz += wobble;
            vec4 mvPosition = modelViewMatrix * world;
            gl_Position = projectionMatrix * mvPosition;
            float distanceFade = clamp(1.0 - length(mvPosition.xyz) / 12.0, 0.15, 1.0);
            vPulse = wave;
            vAlpha = distanceFade * (0.35 + aSize * 0.5);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vAlpha;
          varying float vPulse;

          void main() {
            float glow = clamp(0.65 + vPulse * 0.55, 0.5, 1.35);
            gl_FragColor = vec4(uColor * glow, vAlpha);
          }
        `,
      }),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    mesh.count = particles.length
    particles.forEach((particle, index) => {
      dummy.position.set(
        particle.position[0] * radius * 1.08,
        particle.position[1] * radius * 1.08,
        particle.position[2] * radius * 1.08,
      )
      dummy.scale.setScalar(radius * 0.02 * particle.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [dummy, particles, radius])

  const frameCounter = useRef(0)
  const stride = qualityConfig[quality].particleStride

  /* eslint-disable react-hooks/immutability */
  useFrame(({ clock }) => {
    frameCounter.current += 1
    if (frameCounter.current % stride !== 0) {
      return
    }

    material.uniforms.uTime.value = clock.getElapsedTime()
    material.uniforms.uColor.value = new Color('#9adfff')
  })
  /* eslint-enable react-hooks/immutability */

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(particles.length, 1)]}
    />
  )
}

function GlobeLayer({ radius }: { radius: number }) {
  return (
    <group>
      <mesh scale={radius}>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial
          color="#1d2f47"
          transparent
          opacity={0.96}
        />
      </mesh>
      <mesh scale={radius * 1.03}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          color="#6db9ff"
          transparent
          opacity={0.15}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function MapStageScene({
  scene,
  quality,
}: {
  scene: SceneData
  quality: MapQuality
}) {
  const rootRef = useRef<Group>(null)
  const { size } = useThree()
  const radius = Math.min(size.width, size.height) * 0.42

  useFrame((_, delta) => {
    if (!rootRef.current) {
      return
    }

    rootRef.current.rotation.y += delta * 0.06
    rootRef.current.rotation.x = Math.sin(performance.now() * 0.00012) * 0.04
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, radius * 2.45]} fov={35} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[2, 1, 2]} intensity={1.45} color="#d6e8ff" />
      <pointLight position={[-2, -1, -2]} intensity={0.95} color="#7cc7ff" />
      <group ref={rootRef}>
        <GlobeLayer radius={radius} />
        <RegionLayer regions={scene.regions} radius={radius} />
        <RegionInflowLayer inflows={scene.inflows} radius={radius} />
        <BorderLayer borders={scene.borders} radius={radius} />
        <CityLightLayer lights={scene.lights} radius={radius} />
        <ParticleLayer particles={scene.particles} radius={radius} quality={quality} />
      </group>
    </>
  )
}

export function MapStageR3F() {
  const quality = useUIStore((state) => state.mapQuality)
  const factionMetaLoadedAt = factionMetaStore((state) => state.loadedAt)
  const regionSignature = useGameStore((state) =>
    compactDefined(state.regions)
      .map((region) => `${region.id}:${region.owner ?? 'none'}:${region.developmentLevel}:${region.neighbors.join(',')}`)
      .join('|'),
  )
  const transitionSignature = useGameStore((state) =>
    state.regionTransitionLog
      .map((entry) => `${entry.id}:${entry.region_id}:${entry.new_owner ?? 'none'}:${entry.animation_params.direction}:${entry.started_at}`)
      .join('|'),
  )
  const borderSignature = useGameStore((state) =>
    Object.entries(state.borderTensionMap)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}:${value.tension}:${value.visual_state}`)
      .join('|'),
  )

  const scene = useMemo(() => {
    void borderSignature
    void factionMetaLoadedAt
    void regionSignature
    void transitionSignature
    return buildSceneData(gameStoreApi.getState(), quality)
  }, [borderSignature, factionMetaLoadedAt, quality, regionSignature, transitionSignature])

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop="always"
    >
      <MapStageScene scene={scene} quality={quality} />
    </Canvas>
  )
}
