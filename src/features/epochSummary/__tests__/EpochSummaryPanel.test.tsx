/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpochSummaryPanel } from '../EpochSummaryPanel'
import { epochSummaryStore } from '@/store/epochSummaryStore'
import { gameStoreApi } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

vi.mock('@/render/MapStage2D', () => ({
  MapStage2D: () => <div data-testid="map-stage" />,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function renderPanel() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<EpochSummaryPanel />)
  })

  return { container, root }
}

describe('EpochSummaryPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    epochSummaryStore.getState().reset()
    useUIStore.getState().setHudMode('arbitrate-summary')
    gameStoreApi.setState({
      epoch: {
        id: 4,
        turn: 1,
        phase: 'arbitrate',
        arbitratePhase: 'summary',
        phaseStartedAt: 1_000,
        phaseDurationMs: 1_000,
      },
      events: [],
    } as unknown as Parameters<typeof gameStoreApi.setState>[0])
  })

  afterEach(() => {
    epochSummaryStore.getState().reset()
    useUIStore.getState().setHudMode('observe')
    vi.useRealTimers()
  })

  it('shows the loading hologram before summary narration arrives', () => {
    const { container, root } = renderPanel()

    expect(container.textContent).toContain('正在生成纪元旁白...')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('shows a timeout message after sixty seconds without narration', () => {
    const { container, root } = renderPanel()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(container.textContent).toContain('旁白生成超时，请刷新')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
