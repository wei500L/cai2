import type { ExplosionEvent } from '@/protocol/types'

export type GlobeRenderer = 'globe' | 'r3f' | '2d'

export type CameraPreset = 'overview' | 'focus' | 'cinematic'

export type { ExplosionEvent }

export type GlobeInstanceSnapshot = {
  globe: import('globe.gl').GlobeInstance
  scene: import('three').Scene
  camera: import('three').Camera
  renderer: import('three').WebGLRenderer
}
