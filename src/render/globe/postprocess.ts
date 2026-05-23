import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from 'postprocessing'
import type { Camera, Scene, WebGLRenderer } from 'three'
import { Vector2 } from 'three'

export type MoonComposer = EffectComposer & {
  __moonEffects: {
    bloom: BloomEffect
    vignette: VignetteEffect
    noise: NoiseEffect
    effectPass: EffectPass
  }
}

export type MoonBloomOptions = {
  strength?: number
  radius?: number
  threshold?: number
  vignetteDarkness?: number
  noiseOpacity?: number
  noiseEnabled?: boolean
}

export type ComposerBridge = {
  render: () => void
  setSize: (width: number, height: number) => void
  dispose: () => void
}

/**
 * `globe.gl` does not expose a public tick override. If a future upgrade removes
 * the internal composer hook this bridge may need to be rewritten; see globe.gl
 * issue #xxx for the original workaround.
 */
export function setupBloom(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: MoonBloomOptions = {},
) {
  const composer = new EffectComposer(renderer) as MoonComposer
  composer.addPass(new RenderPass(scene, camera))

  const bloom = new BloomEffect({
    intensity: options.strength ?? 1.4,
    radius: options.radius ?? 0.6,
    luminanceThreshold: options.threshold ?? 0.85,
    mipmapBlur: true,
  })
  const vignette = new VignetteEffect({
    darkness: options.vignetteDarkness ?? 0.6,
  })
  const noise = new NoiseEffect({
    blendFunction: BlendFunction.SCREEN,
    premultiply: true,
  })
  noise.blendMode.opacity.value = options.noiseEnabled === false ? 0 : options.noiseOpacity ?? 0.06

  const effectPass = new EffectPass(camera, bloom, vignette, noise)
  composer.addPass(effectPass)
  composer.__moonEffects = { bloom, vignette, noise, effectPass }

  const size = new Vector2()
  renderer.getSize(size)
  composer.setSize(size.x, size.y)

  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    composer.dispose()
  }

  return { composer, dispose }
}

export function bindComposerBridge(target: ComposerBridge, composer: MoonComposer) {
  const originalRender = target.render.bind(target)
  const originalSetSize = target.setSize.bind(target)
  const originalDispose = target.dispose.bind(target)

  let disposed = false
  const bridgeDispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    composer.dispose()
    originalDispose()
  }

  target.render = () => {
    composer.render()
  }
  target.setSize = (width: number, height: number) => {
    composer.setSize(width, height)
    originalSetSize(width, height)
  }
  target.dispose = bridgeDispose

  return {
    restore() {
      target.render = originalRender
      target.setSize = originalSetSize
      target.dispose = originalDispose
    },
    dispose: bridgeDispose,
  }
}
