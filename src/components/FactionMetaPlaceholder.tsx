import type { FactionId } from '@/types/faction'

export function FactionMetaPlaceholder({
  factionId,
  className = '',
}: {
  factionId: FactionId | string
  className?: string
}) {
  return (
    <div
      className={`rounded border border-[color:rgba(148,163,184,0.24)] bg-[color:rgba(148,163,184,0.08)] p-3 text-[color:rgba(203,213,225,0.72)] ${className}`}
      data-testid="faction-meta-placeholder"
    >
      <div className="mb-2 h-3 w-24 animate-pulse bg-[color:rgba(148,163,184,0.24)]" />
      <div className="mb-3 h-8 w-full animate-pulse bg-[color:rgba(148,163,184,0.16)]" />
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em]">{factionId}</span>
    </div>
  )
}
