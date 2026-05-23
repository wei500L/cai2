/** @vitest-environment jsdom */

import { useEffect } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { GlobeInstanceProvider } from '../GlobeInstanceProvider'
import { useGlobeInstance } from '../useGlobeInstance'
import type { GlobeInstanceSnapshot } from '../globeTypes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function Consumer({ onValue }: { onValue: (value: GlobeInstanceSnapshot | null) => void }) {
  const value = useGlobeInstance()
  useEffect(() => {
    onValue(value)
  }, [onValue, value])
  return null
}

describe('useGlobeInstance', () => {
  it('reads the published globe snapshot from context', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const snapshot: GlobeInstanceSnapshot = {
      globe: {} as GlobeInstanceSnapshot['globe'],
      scene: {} as GlobeInstanceSnapshot['scene'],
      camera: {} as GlobeInstanceSnapshot['camera'],
      renderer: {} as GlobeInstanceSnapshot['renderer'],
    }
    let seen: GlobeInstanceSnapshot | null = null
    const captureValue = (value: GlobeInstanceSnapshot | null) => {
      seen = value
    }

    act(() => {
      root.render(
        <GlobeInstanceProvider value={snapshot}>
          <Consumer onValue={captureValue} />
        </GlobeInstanceProvider>,
      )
    })

    expect(seen).toBe(snapshot)

    act(() => {
      root.render(
        <GlobeInstanceProvider value={null}>
          <Consumer onValue={captureValue} />
        </GlobeInstanceProvider>,
      )
    })

    expect(seen).toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
