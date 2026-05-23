/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { GlowPanel } from '../GlowPanel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

describe('GlowPanel', () => {
  it('lets children stretch to the full panel height', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <GlowPanel className="h-full rounded-none">
          <div data-testid="content" className="h-full" />
        </GlowPanel>,
      )
    })

    const panel = container.querySelector('.glow-panel')
    expect(panel).not.toBeNull()

    const contentWrapper = Array.from(panel?.children ?? []).find(
      (child) => typeof (child as HTMLElement).className === 'string' && !(child as HTMLElement).className.includes('absolute'),
    ) as HTMLElement | undefined

    expect(contentWrapper).toBeDefined()
    expect(contentWrapper?.className).toContain('relative')
    expect(contentWrapper?.className).toContain('h-full')
    expect(contentWrapper?.className).toContain('w-full')
    expect(contentWrapper?.className).toContain('min-h-0')
    expect(contentWrapper?.querySelector('[data-testid="content"]')).not.toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
