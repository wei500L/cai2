import {
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three'
import { latLngToVec3 } from '@/render/globe/explosionFx'

export type SmokeColumnInput = {
  hexId: string
  lat: number
  lng: number
  severity: number
  fallout: number
  ttlTurns: number
  sinceTurn: number
}

export type SmokeColumnManager = {
  sync: (entries: SmokeColumnInput[]) => void
  update: (dtMs: number) => void
  dispose: () => void
  activeCount: () => number
}

const MAX_COLUMNS = 48

type ActiveSmokeColumn = SmokeColumnInput & {
  seed: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function makeMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new Vector3(0.14, 0.15, 0.14) },
      uColorB: { value: new Vector3(0.28, 0.3, 0.24) },
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSeverity;
      attribute float aFallout;
      attribute float aHeight;
      attribute float aWidth;

      uniform float uTime;

      varying float vAlpha;
      varying float vMix;

      float rand(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        float time = uTime * 0.001;
        float phase = time * (0.65 + aSeverity * 0.3) + aSeed * 19.0;
        float layer = clamp((position.y + 0.5) * 0.9, 0.0, 1.0);
        float rise = fract(time * (0.1 + aSeverity * 0.08) + aSeed);
        float wobble = sin(phase + position.y * 2.8) * (0.045 + aSeverity * 0.1);
        float curl = cos(phase * 1.27 + position.x * 4.1) * (0.035 + aFallout * 0.07);

        vec3 displaced = position;
        displaced.x += wobble + curl;
        displaced.z += sin(phase * 0.91 + position.z * 4.0) * (0.03 + aFallout * 0.06);
        displaced.y += rise * aHeight * (0.2 + aSeverity * 0.34);
        displaced.xz *= 1.0 + layer * aWidth * 0.18;

        vAlpha = clamp((0.26 + aSeverity * 0.35 + aFallout * 0.18) * (1.0 - layer * 0.45), 0.04, 0.75);
        vMix = clamp(rand(aSeed * 13.7 + layer * 7.1), 0.0, 1.0);

        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(displaced, 1.0);
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
    depthTest: true,
    side: DoubleSide,
    blending: NormalBlending,
  })
}

function makeInstanceMatrix(entry: SmokeColumnInput) {
  const origin = latLngToVec3(entry.lat, entry.lng, 0.012 + entry.severity * 0.016)
  const normal = origin.clone().normalize()
  const reference = Math.abs(normal.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const east = new Vector3().crossVectors(reference, normal).normalize()
  const north = new Vector3().crossVectors(normal, east).normalize()
  const height = 0.84 + entry.severity * 2.15
  const width = 0.14 + entry.severity * 0.12 + entry.fallout * 0.06

  return new Matrix4().set(
    east.x * width,
    normal.x * height,
    north.x * width,
    origin.x,
    east.y * width,
    normal.y * height,
    north.y * width,
    origin.y,
    east.z * width,
    normal.z * height,
    north.z * width,
    origin.z,
    0,
    0,
    0,
    1,
  )
}

export class SmokeColumnController {
  private readonly scene: Scene
  private readonly mesh: InstancedMesh
  private readonly material: ShaderMaterial
  private readonly seedAttribute: InstancedBufferAttribute
  private readonly severityAttribute: InstancedBufferAttribute
  private readonly falloutAttribute: InstancedBufferAttribute
  private readonly heightAttribute: InstancedBufferAttribute
  private readonly widthAttribute: InstancedBufferAttribute
  private readonly maxColumns: number
  private active = new Map<string, ActiveSmokeColumn>()
  private timeMs = 0

  constructor(scene: Scene, maxColumns = MAX_COLUMNS) {
    this.scene = scene
    this.maxColumns = maxColumns
    this.material = makeMaterial()
    const geometry = new CylinderGeometry(1, 1.25, 1, 8, 10, true)
    this.seedAttribute = new InstancedBufferAttribute(new Float32Array(maxColumns), 1)
    this.severityAttribute = new InstancedBufferAttribute(new Float32Array(maxColumns), 1)
    this.falloutAttribute = new InstancedBufferAttribute(new Float32Array(maxColumns), 1)
    this.heightAttribute = new InstancedBufferAttribute(new Float32Array(maxColumns), 1)
    this.widthAttribute = new InstancedBufferAttribute(new Float32Array(maxColumns), 1)

    this.mesh = new InstancedMesh(geometry, this.material, Math.max(1, maxColumns))
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.seedAttribute.setUsage(DynamicDrawUsage)
    this.severityAttribute.setUsage(DynamicDrawUsage)
    this.falloutAttribute.setUsage(DynamicDrawUsage)
    this.heightAttribute.setUsage(DynamicDrawUsage)
    this.widthAttribute.setUsage(DynamicDrawUsage)
    this.mesh.geometry.setAttribute('aSeed', this.seedAttribute)
    this.mesh.geometry.setAttribute('aSeverity', this.severityAttribute)
    this.mesh.geometry.setAttribute('aFallout', this.falloutAttribute)
    this.mesh.geometry.setAttribute('aHeight', this.heightAttribute)
    this.mesh.geometry.setAttribute('aWidth', this.widthAttribute)
    this.mesh.visible = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.scene.add(this.mesh)
  }

  sync(entries: SmokeColumnInput[]) {
    const next = entries
      .filter((entry) => entry.severity >= 0.4 && entry.ttlTurns > 0)
      .sort((left, right) => right.severity - left.severity || left.hexId.localeCompare(right.hexId))
      .slice(0, this.maxColumns)

    const nextActive = new Map<string, ActiveSmokeColumn>()
    next.forEach((entry, index) => {
      nextActive.set(entry.hexId, {
        ...entry,
        seed: hashString(`${entry.hexId}:${index}`),
      })
    })

    this.active = nextActive

    let index = 0
    for (const entry of this.active.values()) {
      this.mesh.setMatrixAt(index, makeInstanceMatrix(entry))
      this.seedAttribute.array[index] = entry.seed
      this.severityAttribute.array[index] = clamp(entry.severity, 0, 1)
      this.falloutAttribute.array[index] = clamp(entry.fallout, 0, 1)
      this.heightAttribute.array[index] = 0.84 + entry.severity * 2.15
      this.widthAttribute.array[index] = 0.14 + entry.severity * 0.12 + entry.fallout * 0.06
      index += 1
    }

    for (let cursor = index; cursor < this.maxColumns; cursor += 1) {
      this.seedAttribute.array[cursor] = 0
      this.severityAttribute.array[cursor] = 0
      this.falloutAttribute.array[cursor] = 0
      this.heightAttribute.array[cursor] = 0
      this.widthAttribute.array[cursor] = 0
      this.mesh.setMatrixAt(cursor, new Matrix4())
    }

    this.mesh.count = this.active.size
    this.mesh.visible = this.mesh.count > 0
    this.mesh.instanceMatrix.needsUpdate = true
    this.seedAttribute.needsUpdate = true
    this.severityAttribute.needsUpdate = true
    this.falloutAttribute.needsUpdate = true
    this.heightAttribute.needsUpdate = true
    this.widthAttribute.needsUpdate = true
  }

  update(dtMs: number) {
    this.timeMs += Math.max(0, dtMs)
    this.material.uniforms.uTime.value = this.timeMs
  }

  activeCount() {
    return this.active.size
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.active.clear()
  }
}

export function createSmokeColumn(scene: Scene, maxColumns = MAX_COLUMNS) {
  return new SmokeColumnController(scene, maxColumns)
}
