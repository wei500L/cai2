import { useRef } from 'react'
import { PixelButton } from '@/components/PixelButton'

type EnterButtonProps = {
  onHoverChange: (active: boolean, center?: { x: number; y: number }) => void
}

function EnterIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
      <path d="M4 12h13" />
      <path d="m12 6 6 6-6 6" />
      <path d="M20 4v16" />
    </svg>
  )
}

export function EnterButton({ onHoverChange }: EnterButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const resolveCenter = () => {
    const rect = buttonRef.current?.getBoundingClientRect()

    if (!rect) {
      return undefined
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }

  const navigateToFactionSelect = () => {
    window.history.pushState(null, '', '/faction-select')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div
      className="relative"
      onPointerEnter={() => onHoverChange(true, resolveCenter())}
      onPointerMove={() => onHoverChange(true, resolveCenter())}
      onPointerLeave={() => onHoverChange(false)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-5 opacity-70 blur-xl transition-opacity duration-200"
        style={{
          background:
            'radial-gradient(circle, rgba(51,170,255,0.28) 0%, rgba(51,170,255,0.08) 44%, transparent 72%)',
        }}
      />
      <PixelButton
        ref={buttonRef}
        className="relative min-h-12 min-w-[15rem] border-cyan-200/80 px-6 py-4 text-[0.78rem] tracking-[0.26em] sm:min-w-[18rem] sm:text-sm"
        icon={<EnterIcon />}
        onClick={navigateToFactionSelect}
      >
        进入指挥系统
      </PixelButton>
    </div>
  )
}
