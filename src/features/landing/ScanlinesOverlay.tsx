import { Scanlines } from '@/components/Scanlines'

export function ScanlinesOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <Scanlines className="fixed inset-0 opacity-80" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(51,170,255,0.035) 50%, transparent 100%)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
