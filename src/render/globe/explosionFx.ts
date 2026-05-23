import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three'
import type { ExplosionEvent, ExplosionKind } from '@/protocol/types'

const GLOBE_RADIUS = 100
const DEFAULT_TTL_MS = 4000
const MAX_PARTICLES = 600
const PARTICLES_PER_INTENSITY = 200

export type ExplosionFxHandle = {
  update: (dtMs: number) => void
  dispose: () => void
  isAlive: () => boolean
}

export type ExplosionEmitterConfig = {
  centerLat: number
  centerLng: number
  intensity: number
  kind: ExplosionKind
  ttl_ms?: number
  particleMultiplier?: number
}

type Palette = {
  core: Color
  edge: Color
  ring: Color
}

const PALETTES: Record<ExplosionKind, Palette> = {
  conventional: {
    core: new Color('#ffcf66'),
    edge: new Color('#ff3d1f'),
    ring: new Color('#ff7a24'),
  },
  nuke: {
    core: new Color('#ffffff'),
    edge: new Color('#7be8ff'),
    ring: new Color('#d7fbff'),
  },
  aerial: {
    core: new Color('#ffe56d'),
    edge: new Color('#ff8f1f'),
    ring: new Color('#ffc247'),
  },
  naval: {
    core: new Color('#f8fbff'),
    edge: new Color('#4fb7ff'),
    ring: new Color('#9ce9ff'),
  },
  uprising: {
    core: new Color('#ff5ebd'),
    edge: new Color('#9b1bff'),
    ring: new Color('#ff386d'),
  },
  siege: {
    core: new Color('#d49b5a'),
    edge: new Color('#5d3821'),
    ring: new Color('#9a6840'),
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizedIntensity(intensity: number) {
  return clamp(Number.isFinite(intensity) ? intensity : 1, 0.5, 3)
}

function ttlSeconds(ttlMs: number | undefined) {
  return Math.max(0.001, (ttlMs ?? DEFAULT_TTL_MS) / 1000)
}

function hash(index: number, salt = 0) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function latLngToVec3(lat: number, lng: number, altitude = 0) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  const radius = GLOBE_RADIUS * (1 + altitude)
  const sinPhi = Math.sin(phi)

  return new Vector3(
    radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta),
  )
}

function tangentBasis(normal: Vector3) {
  const reference = Math.abs(normal.y) > 0.92 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const east = new Vector3().crossVectors(reference, normal).normalize()
  const north = new Vector3().crossVectors(normal, east).normalize()
  return { east, north }
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
    return
  }

  material.dispose()
}

function removeAndDispose(object: Object3D & { geometry?: { dispose: () => void }; material?: Material | Material[] }) {
  object.removeFromParent()
  object.geometry?.dispose()
  if (object.material) {
    disposeMaterial(object.material)
  }
}

function makeParticleMaterial(palette: Palette, ttl: number, origin: Vector3, normal: Vector3, intensity: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTtl: { value: ttl },
      uOrigin: { value: origin },
      uNormal: { value: normal },
      uColorA: { value: palette.core },
      uColorB: { value: palette.edge },
      uIntensity: { value: intensity },
    },
    vertexShader: `
      attribute float aSeed;
      attribute vec3 aDir;
      attribute float aSpeed;

      uniform float uTime;
      uniform float uTtl;
      uniform vec3 uOrigin;
      uniform vec3 uNormal;
      uniform float uIntensity;

      varying float vAlpha;
      varying float vMix;

      float rand(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        float life = clamp(uTime / uTtl, 0.0, 1.0);
        float easeOut = 1.0 - pow(1.0 - life, 2.0);
        float lift = 0.32 + rand(aSeed * 17.31) * 0.74;
        vec3 burstDir = normalize(aDir + uNormal * lift);
        float travel = aSpeed * easeOut * uTtl;
        float gravityFalloff = life * life * 2.8;
        vec3 center = uOrigin + burstDir * travel - uNormal * gravityFalloff;
        float pulse = 0.72 + rand(aSeed * 9.17) * 0.72;
        float particleScale = (0.24 + uIntensity * 0.2) * pulse * (1.0 - life);
        vec3 displaced = center + position * max(0.02, particleScale);

        vAlpha = pow(1.0 - life, 1.45) * (0.45 + rand(aSeed * 3.7) * 0.55);
        vMix = rand(aSeed * 23.11);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;

      varying float vAlpha;
      varying float vMix;

      void main() {
        vec3 color = mix(uColorA, uColorB, vMix);
        gl_FragColor = vec4(color, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

export function createExplosionEmitter(scene: Scene, config: ExplosionEmitterConfig): ExplosionFxHandle {
  const intensity = normalizedIntensity(config.intensity)
  const particleMultiplier = clamp(config.particleMultiplier ?? 1, 0.1, 1)
  const count = Math.min(
    MAX_PARTICLES,
    Math.max(1, Math.round(intensity * PARTICLES_PER_INTENSITY * particleMultiplier)),
  )
  const ttl = ttlSeconds(config.ttl_ms)
  const origin = latLngToVec3(config.centerLat, config.centerLng, 0.012)
  const normal = origin.clone().normalize()
  const { east, north } = tangentBasis(normal)
  const palette = PALETTES[config.kind]
  const geometry = new SphereGeometry(0.4, 8, 6)
  const material = makeParticleMaterial(palette, ttl, origin, normal, intensity)
  const mesh = new InstancedMesh(geometry, material, count)
  const seeds = new Float32Array(count)
  const dirs = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  const identity = new Matrix4()

  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 1) * Math.PI * 2
    const spread = Math.pow(hash(index, 2), 0.55)
    const tangent = east.clone().multiplyScalar(Math.cos(angle)).add(north.clone().multiplyScalar(Math.sin(angle)))
      .normalize()
      .multiplyScalar(0.55 + spread * 0.45)

    seeds[index] = hash(index, 3) * 1000 + index
    dirs[index * 3] = tangent.x
    dirs[index * 3 + 1] = tangent.y
    dirs[index * 3 + 2] = tangent.z
    speeds[index] = 4.8 + intensity * 1.8 + hash(index, 4) * (4.2 + intensity * 1.4)
    mesh.setMatrixAt(index, identity)
  }

  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
  geometry.setAttribute('aDir', new InstancedBufferAttribute(dirs, 3))
  geometry.setAttribute('aSpeed', new InstancedBufferAttribute(speeds, 1))
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.renderOrder = 40
  scene.add(mesh)

  let elapsed = 0
  let disposed = false

  return {
    update(dtMs) {
      if (disposed) {
        return
      }
      elapsed += dtMs / 1000
      material.uniforms.uTime.value = elapsed
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      removeAndDispose(mesh)
    },
    isAlive() {
      return !disposed && elapsed < ttl
    },
  }
}

function makeRingMaterial(palette: Palette, ttl: number, maxRadius: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTtl: { value: ttl },
      uMaxRadius: { value: maxRadius },
      uColor: { value: palette.ring },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uTtl;
      uniform float uMaxRadius;

      varying float vLife;
      varying float vBand;

      void main() {
        vLife = clamp(uTime / uTtl, 0.0, 1.0);
        float radius = mix(0.35, uMaxRadius, 1.0 - pow(1.0 - vLife, 2.0));
        vec3 scaled = vec3(position.xy * radius, position.z);
        vBand = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(scaled, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;

      varying float vLife;
      varying float vBand;

      void main() {
        float edge = smoothstep(0.78, 0.92, vBand) * (1.0 - smoothstep(0.94, 1.0, vBand));
        float alpha = edge * pow(1.0 - vLife, 1.2) * 0.72;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

export function createShockwaveRing(scene: Scene, config: ExplosionEmitterConfig): ExplosionFxHandle {
  const intensity = normalizedIntensity(config.intensity)
  const ttl = ttlSeconds(config.ttl_ms)
  const origin = latLngToVec3(config.centerLat, config.centerLng, 0.014)
  const normal = origin.clone().normalize()
  const palette = PALETTES[config.kind]
  const maxRadius = 5.5 + intensity * 5.2
  const geometry = new RingGeometry(0.78, 1, 96, 1)
  const material = makeRingMaterial(palette, ttl * 0.72, maxRadius)
  const ring = new InstancedMesh(geometry, material, 1)

  ring.setMatrixAt(0, new Matrix4())
  ring.instanceMatrix.needsUpdate = true
  ring.position.copy(origin.add(normal.clone().multiplyScalar(0.2)))
  ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal)
  ring.frustumCulled = false
  ring.renderOrder = 35
  scene.add(ring)

  let elapsed = 0
  let disposed = false

  return {
    update(dtMs) {
      if (disposed) {
        return
      }
      elapsed += dtMs / 1000
      material.uniforms.uTime.value = elapsed
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      removeAndDispose(ring)
    },
    isAlive() {
      return !disposed && elapsed < ttl * 0.72
    },
  }
}

export function createMuzzleFlash(scene: Scene, config: ExplosionEmitterConfig): ExplosionFxHandle {
  const intensity = normalizedIntensity(config.intensity)
  const origin = latLngToVec3(config.centerLat, config.centerLng, 0.026)
  const normal = origin.clone().normalize()
  const palette = PALETTES[config.kind]
  const material = new SpriteMaterial({
    color: palette.core,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const sprite = new Sprite(material)

  sprite.position.copy(origin.add(normal.multiplyScalar(0.9)))
  sprite.scale.setScalar(4.4 + intensity * 2.8)
  sprite.frustumCulled = false
  sprite.renderOrder = 50
  scene.add(sprite)

  const ttl = 66
  let elapsed = 0
  let disposed = false

  return {
    update(dtMs) {
      if (disposed) {
        return
      }
      elapsed += dtMs
      material.opacity = clamp(1 - elapsed / ttl, 0, 1)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      removeAndDispose(sprite)
    },
    isAlive() {
      return !disposed && elapsed < ttl
    },
  }
}

export function spawnExplosion(
  scene: Scene,
  event: ExplosionEvent,
  options: { particleMultiplier?: number } = {},
): ExplosionFxHandle {
  const config: ExplosionEmitterConfig = {
    centerLat: event.centerLat,
    centerLng: event.centerLng,
    intensity: event.intensity,
    kind: event.kind,
    ttl_ms: event.ttl_ms,
    particleMultiplier: options.particleMultiplier,
  }
  const handles = [
    createExplosionEmitter(scene, config),
    createShockwaveRing(scene, config),
    createMuzzleFlash(scene, config),
  ]

  let disposed = false

  return {
    update(dtMs) {
      if (disposed) {
        return
      }

      for (const handle of handles) {
        if (handle.isAlive()) {
          handle.update(dtMs)
        } else {
          handle.dispose()
        }
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      handles.forEach((handle) => handle.dispose())
    },
    isAlive() {
      return !disposed && handles.some((handle) => handle.isAlive())
    },
  }
}

export const explosionFxPerfProfile = {
  particlesPerIntensity: PARTICLES_PER_INTENSITY,
  maxParticles: MAX_PARTICLES,
  defaultTtlMs: DEFAULT_TTL_MS,
}
