/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { FactionMetaPlaceholder } from '../FactionMetaPlaceholder'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

describe('FactionMetaPlaceholder', () => {
  it('renders a skeleton block with the faction id', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<FactionMetaPlaceholder factionId="ironCrown" />)
    })

    const placeholder = container.querySelector('[data-testid="faction-meta-placeholder"]')
    expect(placeholder).not.toBeNull()
    expect(placeholder?.textContent).toContain('ironCrown')
    expect(placeholder?.className).toContain('bg-[color:rgba(148,163,184,0.08)]')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
