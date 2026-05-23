export type GlobeRenderer = 'globe' | 'r3f' | '2d'

export type CameraPreset = 'overview' | 'focus' | 'cinematic'

export type ExplosionEvent = {
  id: string
  regionId?: string
  createdAtMs?: number
  ttlMs?: number
  intensity?: number
  [key: string]: unknown
}

export type GlobeInstanceSnapshot = {
  globe: import('globe.gl').GlobeInstance
  scene: import('three').Scene
  camera: import('three').Camera
  renderer: import('three').WebGLRenderer
}
