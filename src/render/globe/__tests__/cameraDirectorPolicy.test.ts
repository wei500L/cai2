import { describe, expect, it } from 'vitest'
import { shouldEnableCameraDirector } from '../cameraDirectorPolicy'

describe('shouldEnableCameraDirector', () => {
  it('only enables the camera director on high quality when cinematic mode is on', () => {
    expect(shouldEnableCameraDirector('low', true)).toBe(false)
    expect(shouldEnableCameraDirector('mid', true)).toBe(false)
    expect(shouldEnableCameraDirector('high', false)).toBe(false)
    expect(shouldEnableCameraDirector('high', true)).toBe(true)
  })
})
