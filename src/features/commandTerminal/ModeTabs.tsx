import { useEffect } from 'react'
import clsx from 'clsx'
import { commandModeLabels, commandModes, type CommandMode } from './types'

type ModeTabsProps = {
  activeMode: CommandMode
  onModeChange: (mode: CommandMode) => void
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function ModeTabs({ activeMode, onModeChange }: ModeTabsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return
      }

      const index = Number(event.key) - 1
      const mode = commandModes[index]

      if (mode) {
        event.preventDefault()
        onModeChange(mode)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onModeChange])

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto font-hud text-[0.58rem] uppercase tracking-[0.18em]">
      {commandModes.map((mode, index) => {
        const active = activeMode === mode

        return (
          <button
            key={mode}
            type="button"
            className={clsx(
              'relative h-8 min-w-[4.2rem] border px-2 text-[color:var(--text-primary)] transition-[border-color,background-color,box-shadow] duration-150',
              active ? 'bg-[color:rgba(51,170,255,0.14)]' : 'bg-[color:rgba(255,255,255,0.025)]',
            )}
            style={{
              borderColor: active ? 'var(--border-glow)' : 'rgba(255,255,255,0.14)',
              boxShadow: active ? '0 0 14px rgba(51,170,255,0.24)' : 'none',
            }}
            onClick={() => onModeChange(mode)}
          >
            <span className="text-[color:rgba(196,228,255,0.5)]">{index + 1}</span>{' '}
            {commandModeLabels[mode]}
          </button>
        )
      })}
    </div>
  )
}
