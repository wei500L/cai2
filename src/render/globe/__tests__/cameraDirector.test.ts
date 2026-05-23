import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraDirector, type SpeechCameraEvent } from '../cameraDirector'
import type { ExplosionEvent } from '@/protocol/types'

function createGlobeMock() {
  const pointOfView = vi.fn()
  const startHandlers: Array<() => void> = []

  return {
    pointOfView,
    controls: () => ({
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'start') {
          startHandlers.push(listener)
        }
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type !== 'start') {
          return
        }

        const index = startHandlers.indexOf(listener)
        if (index >= 0) {
          startHandlers.splice(index, 1)
        }
      },
      emitStart: () => {
        for (const listener of startHandlers) {
          listener()
        }
      },
    }),
  }
}

function makeExplosion(kind: ExplosionEvent['kind'], id: string, centerLat = 12, centerLng = 24): ExplosionEvent {
  return {
    id,
    kind,
    centerLat,
    centerLng,
    intensity: 1.5,
    ttl_ms: 4000,
    affected_hex_ids: [`${id}-hex`],
    primary_hex_id: `${id}-hex`,
    economic_loss_pct: 0.18,
    narrative_hint: kind,
  }
}

function makeSpeech(id: string): SpeechCameraEvent {
  return {
    id,
    createdAt: 1,
    epoch: 1,
    turn: 1,
    phase: 'action',
    priority: 'P0',
    kind: 'speech',
    actor: 'ironCrown',
    payload: {
      channel: 'public',
      stance: 'ceremonial',
      text: 'test',
    },
    narration: 'test',
    speakerCapital: { lat: 32, lng: 48 },
  }
}

describe('CameraDirector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preempts low priority camera scripts with higher priority events', () => {
    const globe = createGlobeMock()
    const director = new CameraDirector(globe as never)

    director.onResolveEvent(makeExplosion('conventional', 'low-1', 20, 40))
    director.tick(600)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 20,
      lng: 40,
      altitude: 1.2,
    })

    director.onResolveEvent(makeExplosion('nuke', 'high-1', 8, 16))
    director.tick(300)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 0,
      lng: 0,
      altitude: 2.5,
    })

    director.tick(800)
    expect(director.getCurrentPose()).toMatchObject({
      lat: -7,
      lng: 16,
      altitude: 1.4,
    })

    director.onResolveEvent(makeExplosion('conventional', 'low-2', 90, 120))
    director.tick(800)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 8,
      lng: 16,
      altitude: 0.7,
    })

    director.dispose()
  })

  it('respects keyframe boundaries for the speech script', () => {
    const globe = createGlobeMock()
    const director = new CameraDirector(globe as never)

    director.onResolveEvent(makeSpeech('speech-1'))
    expect(director.getCurrentPose()).toMatchObject({
      lat: 0,
      lng: 0,
      altitude: 2.5,
    })

    director.tick(400)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 32,
      lng: 48,
      altitude: 2.2,
    })

    director.tick(800)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 32,
      lng: 48,
      altitude: 2.2,
    })

    director.tick(800)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 0,
      lng: 0,
      altitude: 2.5,
    })

    director.dispose()
  })

  it('stays inert when disabled and ignores repeated cinematic triggers within 5 seconds', () => {
    const globe = createGlobeMock()
    const director = new CameraDirector(globe as never)
    const event = makeExplosion('nuke', 'nuke-repeat', -12, 90)

    director.setEnabled(false)
    expect(director.onResolveEvent(event)).toBe(false)
    director.tick(1000)
    expect(director.getCurrentPose()).toMatchObject({
      lat: 0,
      lng: 0,
      altitude: 2.5,
    })

    director.setEnabled(true)
    expect(director.onResolveEvent(event)).toBe(true)
    director.tick(1000)
    expect(director.onResolveEvent(event)).toBe(false)
    director.tick(4000)
    expect(director.onResolveEvent(event)).toBe(true)

    director.dispose()
  })
})
