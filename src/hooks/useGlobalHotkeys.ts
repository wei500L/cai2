import { useEffect } from 'react'
import { commandModes } from '@/features/commandTerminal/types'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function blurActiveElement() {
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

export function useGlobalHotkeys() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const ui = useUIStore.getState()
      const game = useGameStore.getState()
      const editable = isEditableTarget(event.target)

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        ui.setHotkeysHelpOpen(false)
        ui.setSettingsOpen(false)
        ui.setEventStreamFullscreen(false)
        ui.setPrivateDrawerOpen(false)
        ui.setMapFocus(null)
        ui.setLastError(null)
        blurActiveElement()
        return
      }

      if (editable) {
        return
      }

      const mode = commandModes[Number(event.key) - 1]
      if (mode) {
        event.preventDefault()
        ui.setCommandModeHotkey(mode)
        ui.setFocusedPanel('bottom')
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        ui.cycleFocusedPanel()
        return
      }

      switch (event.key.toLowerCase()) {
        case 'e':
          event.preventDefault()
          ui.toggleLeftPanel()
          ui.setFocusedPanel('left')
          break
        case 'r':
          event.preventDefault()
          ui.toggleRightPanel()
          ui.setFocusedPanel('right')
          break
        case 'f':
          event.preventDefault()
          ui.toggleEventStreamFullscreen()
          ui.setFocusedPanel('left')
          break
        case 'm':
          event.preventDefault()
          ui.setMapFocus(null)
          ui.setFocusedPanel('center')
          window.dispatchEvent(new CustomEvent('diplomacy:map-reset'))
          break
        case ' ':
          event.preventDefault()
          game.togglePause()
          break
        case 'h':
          event.preventDefault()
          ui.toggleHotkeysHelp()
          break
        case 'd':
          event.preventDefault()
          ui.toggleDevOverlay()
          break
        case ',':
          event.preventDefault()
          ui.toggleSettings()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
