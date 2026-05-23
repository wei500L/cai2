import type { GlobeInstance } from 'globe.gl'
import type { ExplosionEvent } from '@/protocol/types'
import type { GameEvent } from '@/mock/types'

export type CameraPose = {
  lat: number
  lng: number
  altitude: number
}

export type CameraDirectorOptions = {
  cinematicEnabled?: boolean
  reducedMotion?: boolean
}

export type SpeechCameraEvent = GameEvent & {
  speakerCapital?: {
    lat: number
    lng: number
  }
}

type DirectorEvent = ExplosionEvent | SpeechCameraEvent

type DirectorPriority = 0 | 1 | 2 | 3

type DirectorEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

type DirectorFrame = {
  at: number
  pose: CameraPose
  easing?: DirectorEasing
}

type DirectorSequence = {
  id: string
  priority: DirectorPriority
  order: number
  frames: DirectorFrame[]
  introMs: number
  startPose: CameraPose
}

const OVERVIEW_POSE: CameraPose = { lat: 0, lng: 0, altitude: 2.5 }
const PREEMPT_FADE_MS = 300
const CINEMATIC_DEBOUNCE_MS = 5_000
const ALTITUDE_MIN = 0.3
const MOTION_SCALE_REDUCED = 0.5

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLng(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

function normalizePose(pose: CameraPose): CameraPose {
  return {
    lat: clamp(Number.isFinite(pose.lat) ? pose.lat : 0, -90, 90),
    lng: normalizeLng(Number.isFinite(pose.lng) ? pose.lng : 0),
    altitude: Math.max(ALTITUDE_MIN, Number.isFinite(pose.altitude) ? pose.altitude : 2.5),
  }
}

function poseDistance(left: CameraPose, right: CameraPose) {
  return Math.abs(left.lat - right.lat) + Math.abs(shortestLngDelta(left.lng, right.lng)) + Math.abs(left.altitude - right.altitude)
}

function shortestLngDelta(from: number, to: number) {
  return normalizeLng(to - from)
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

function lerpPose(start: CameraPose, end: CameraPose, t: number): CameraPose {
  const progress = clamp(t, 0, 1)
  return normalizePose({
    lat: lerp(start.lat, end.lat, progress),
    lng: normalizeLng(start.lng + shortestLngDelta(start.lng, end.lng) * progress),
    altitude: lerp(start.altitude, end.altitude, progress),
  })
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const sampleStep = 1 / 11
  const sampleValues = new Float32Array(12)

  function calcBezier(a1: number, a2: number, t: number) {
    const inv = 1 - t
    return 3 * a1 * inv * inv * t + 3 * a2 * inv * t * t + t * t * t
  }

  function getSlope(a1: number, a2: number, t: number) {
    const inv = 1 - t
    return 3 * a1 * inv * inv + 6 * (a2 - a1) * inv * t + 3 * (1 - a2) * t * t
  }

  for (let index = 0; index < sampleValues.length; index += 1) {
    sampleValues[index] = calcBezier(x1, x2, index * sampleStep)
  }

  return (x: number) => {
    if (x <= 0) {
      return 0
    }

    if (x >= 1) {
      return 1
    }

    let intervalStart = 0
    let currentSample = 1
    const lastSample = sampleValues.length - 1

    for (; currentSample !== lastSample && sampleValues[currentSample] <= x; currentSample += 1) {
      intervalStart += sampleStep
    }

    currentSample -= 1
    const sampleValue = sampleValues[currentSample]
    const nextSampleValue = sampleValues[currentSample + 1]
    const dist = (x - sampleValue) / (nextSampleValue - sampleValue)
    let guess = intervalStart + dist * sampleStep

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const slope = getSlope(x1, x2, guess)
      if (Math.abs(slope) < 1e-6) {
        break
      }

      const estimated = calcBezier(x1, x2, guess) - x
      guess -= estimated / slope
    }

    return calcBezier(y1, y2, guess)
  }
}

const EASINGS: Record<DirectorEasing, (value: number) => number> = {
  linear: (value) => value,
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
}

function easedProgress(kind: DirectorEasing | undefined, t: number) {
  const easing = kind ?? 'linear'
  return EASINGS[easing](clamp(t, 0, 1))
}

function buildSequenceFrames(
  event: DirectorEvent,
  startPose: CameraPose,
  options: { reducedMotion: boolean },
): DirectorSequence | null {
  const scale = options.reducedMotion ? MOTION_SCALE_REDUCED : 1
  const nukeStart = normalizePose({ lat: 0, lng: 0, altitude: 2.5 })

  if ('kind' in event && event.kind === 'nuke') {
    const centerLat = Number.isFinite(event.centerLat) ? event.centerLat : 0
    const centerLng = Number.isFinite(event.centerLng) ? event.centerLng : 0
    const sequence: DirectorSequence = {
      id: event.id,
      priority: 3,
      order: 0,
      startPose: nukeStart,
      introMs: poseDistance(startPose, nukeStart) > 0.01 ? PREEMPT_FADE_MS * scale : 0,
      frames: [
        { at: 0, pose: nukeStart },
        { at: 800 * scale, pose: normalizePose({ lat: centerLat - 15, lng: centerLng, altitude: 1.4 }), easing: 'ease-out' },
        { at: 1600 * scale, pose: normalizePose({ lat: centerLat, lng: centerLng, altitude: 0.7 }), easing: 'linear' },
        { at: 2800 * scale, pose: normalizePose({ lat: centerLat, lng: centerLng + 60, altitude: 0.7 }), easing: 'ease-in' },
        { at: 4400 * scale, pose: nukeStart, easing: 'ease-out' },
      ],
    }
    return sequence
  }

  if ('kind' in event && ['aerial', 'siege', 'naval', 'conventional'].includes(event.kind)) {
    const centerLat = 'centerLat' in event ? event.centerLat : 0
    const centerLng = 'centerLng' in event ? event.centerLng : 0
    return {
      id: event.id,
      priority: 2,
      order: 0,
      startPose,
      introMs: 0,
      frames: [
        { at: 0, pose: startPose },
        { at: 600 * scale, pose: normalizePose({ lat: centerLat, lng: centerLng, altitude: 1.2 }), easing: 'ease-out' },
        { at: 1800 * scale, pose: normalizePose({ lat: centerLat, lng: centerLng, altitude: 1.2 }), easing: 'linear' },
        { at: 2800 * scale, pose: normalizePose({ lat: 0, lng: 0, altitude: 2.5 }), easing: 'ease-in' },
      ],
    }
  }

  if ('kind' in event && event.kind === 'speech' && 'priority' in event && event.priority === 'P0') {
    const speakerCapital = event.speakerCapital
    if (!speakerCapital) {
      return null
    }

    const targetPose = normalizePose({
      lat: speakerCapital.lat,
      lng: speakerCapital.lng,
      altitude: Math.max(ALTITUDE_MIN, startPose.altitude - 0.3),
    })

    return {
      id: event.id,
      priority: 1,
      order: 0,
      startPose,
      introMs: 0,
      frames: [
        { at: 0, pose: startPose },
        { at: 400 * scale, pose: targetPose, easing: 'ease-out' },
        { at: 1200 * scale, pose: targetPose, easing: 'linear' },
        { at: 2000 * scale, pose: normalizePose({ lat: 0, lng: 0, altitude: 2.5 }), easing: 'ease-in' },
      ],
    }
  }

  return null
}

type TickableGlobe = Pick<GlobeInstance, 'pointOfView'> & {
  controls?: () => unknown | null
}

export class CameraDirector {
  private readonly globe: TickableGlobe
  private readonly queue: DirectorSequence[] = []
  private active: DirectorSequence | null = null
  private activeStartedAtMs = 0
  private activeStartedFrom: CameraPose = OVERVIEW_POSE
  private currentPose: CameraPose = OVERVIEW_POSE
  private elapsedMs = 0
  private enabled = true
  private reducedMotion = false
  private readonly lastCinematicById = new Map<string, number>()
  private readonly onUserInput = () => this.resetToOverview()
  private sequenceOrder = 0

  constructor(globe: TickableGlobe, options: CameraDirectorOptions = {}) {
    this.globe = globe
    this.enabled = options.cinematicEnabled ?? true
    this.reducedMotion = options.reducedMotion ?? false
    this.globe.pointOfView(OVERVIEW_POSE, 0)
    const controls = this.globe.controls?.() as {
      addEventListener?: (type: string, listener: () => void) => void
    } | null
    controls?.addEventListener?.('start', this.onUserInput)
  }

  dispose() {
    const controls = this.globe.controls?.() as {
      removeEventListener?: (type: string, listener: () => void) => void
    } | null
    controls?.removeEventListener?.('start', this.onUserInput)
    this.queue.length = 0
    this.active = null
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.resetToOverview()
    }
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion
  }

  isActive() {
    return this.active !== null
  }

  getCurrentPose() {
    return this.currentPose
  }

  onResolveEvent(event: DirectorEvent) {
    if (!this.enabled) {
      return false
    }

    const sequence = buildSequenceFrames(event, this.currentPose, {
      reducedMotion: this.reducedMotion,
    })

    if (!sequence) {
      return false
    }

    if (sequence.priority === 3) {
      const lastTriggeredAt = this.lastCinematicById.get(sequence.id)
      if (typeof lastTriggeredAt === 'number' && this.elapsedMs - lastTriggeredAt < CINEMATIC_DEBOUNCE_MS) {
        return false
      }
      this.lastCinematicById.set(sequence.id, this.elapsedMs)
    }

    sequence.order = this.sequenceOrder += 1
    this.enqueue(sequence)
    return true
  }

  tick(dtMs: number) {
    this.elapsedMs += Math.max(0, dtMs)

    if (!this.active) {
      this.startNextSequence()
    }

    if (!this.active) {
      return
    }

    const localMs = this.elapsedMs - this.activeStartedAtMs
    const sequence = this.active
    const introMs = sequence.introMs

    if (introMs > 0 && localMs < introMs) {
      const progress = easedProgress('ease-out', localMs / introMs)
      this.applyPose(lerpPose(this.activeStartedFrom, sequence.startPose, progress))
      return
    }

    const scriptMs = Math.max(0, localMs - introMs)
    const lastFrame = sequence.frames[sequence.frames.length - 1]

    if (scriptMs >= lastFrame.at) {
      this.applyPose(lastFrame.pose)
      this.active = null
      this.startNextSequence()
      return
    }

    let frameIndex = 0
    for (let index = 0; index < sequence.frames.length - 1; index += 1) {
      if (scriptMs >= sequence.frames[index].at && scriptMs <= sequence.frames[index + 1].at) {
        frameIndex = index
        break
      }
    }

    const fromFrame = sequence.frames[frameIndex]
    const toFrame = sequence.frames[frameIndex + 1]
    if (!toFrame) {
      this.applyPose(lastFrame.pose)
      return
    }

    const segmentDuration = Math.max(1, toFrame.at - fromFrame.at)
    const segmentProgress = (scriptMs - fromFrame.at) / segmentDuration
    const eased = easedProgress(toFrame.easing, segmentProgress)
    this.applyPose(lerpPose(fromFrame.pose, toFrame.pose, eased))
  }

  private enqueue(sequence: DirectorSequence) {
    if (!this.active) {
      this.active = sequence
      this.activeStartedAtMs = this.elapsedMs
      this.activeStartedFrom = this.currentPose
      return
    }

    if (sequence.priority > this.active.priority) {
      this.active = sequence
      this.activeStartedAtMs = this.elapsedMs
      this.activeStartedFrom = this.currentPose
      return
    }

    const insertAt = this.queue.findIndex(
      (item) =>
        item.priority < sequence.priority ||
        (item.priority === sequence.priority && item.order > sequence.order),
    )

    if (insertAt < 0) {
      this.queue.push(sequence)
      return
    }

    this.queue.splice(insertAt, 0, sequence)
  }

  private startNextSequence() {
    if (this.active || this.queue.length === 0) {
      return
    }

    this.active = this.queue.shift() ?? null
    if (!this.active) {
      return
    }

    this.activeStartedAtMs = this.elapsedMs
    this.activeStartedFrom = this.currentPose
  }

  private applyPose(pose: CameraPose) {
    const nextPose = normalizePose(pose)
    this.currentPose = nextPose
    this.globe.pointOfView(nextPose, 0)
  }

  private resetToOverview() {
    this.queue.length = 0
    this.active = null
    this.applyPose(OVERVIEW_POSE)
  }
}
