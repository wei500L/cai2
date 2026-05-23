/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AINarration } from '../AINarration'
import { epochSummaryStore } from '@/store/epochSummaryStore'
import { gameStoreApi } from '@/store/gameStore'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function renderNode() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<AINarration />)
  })

  return { container, root }
}

function setEpoch(epochId: number, aiThinkingState: Record<string, unknown> | null = null) {
  gameStoreApi.setState({
    epoch: {
      id: epochId,
      turn: 1,
      phase: 'arbitrate',
      arbitratePhase: 'summary',
      phaseStartedAt: 1_000,
      phaseDurationMs: 1_000,
    },
    aiThinkingState,
  } as Parameters<typeof gameStoreApi.setState>[0])
}

describe('AINarration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    epochSummaryStore.getState().reset()
    setEpoch(4, {
      progress: 0.48,
      phase: 'arbitrate',
      model: 'mock-llm',
      elapsed_ms: 0,
      fallback: false,
    })
  })

  afterEach(() => {
    epochSummaryStore.getState().reset()
    gameStoreApi.setState({
      aiThinkingState: null,
    } as Parameters<typeof gameStoreApi.setState>[0])
    vi.useRealTimers()
  })

  it('shows a loading skeleton when the epic narration has not arrived', () => {
    const { container, root } = renderNode()

    expect(container.textContent).toContain('正在生成纪元旁白...')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders the epic narration with progressive markdown', () => {
    epochSummaryStore.getState().applyEpic({
      epoch: 4,
      source: 'llm',
      narrative: '# 纪元四\n**胜利** 与 *代价*',
    })

    const { container, root } = renderNode()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(container.textContent).toContain('纪元四')
    expect(container.textContent).toContain('胜利')
    expect(container.textContent).toContain('代价')
    expect(container.querySelector('h3')).not.toBeNull()
    expect(container.querySelector('strong')).not.toBeNull()
    expect(container.querySelector('em')).not.toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the fallback marker for template-generated narration', () => {
    epochSummaryStore.getState().applyEpic({
      epoch: 4,
      source: 'template_fallback',
      narrative: '纪元四终结。',
    })

    const { container, root } = renderNode()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(container.textContent).toContain('FALLBACK')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
