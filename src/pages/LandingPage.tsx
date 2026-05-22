import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { PixelButton } from '@/components/PixelButton'
import { Scanlines } from '@/components/Scanlines'
import { ScrollNumber } from '@/components/ScrollNumber'
import { StatusBadge } from '@/components/StatusBadge'
import {
  factionIds,
  factionLabels,
  factionTokens,
  relationLabels,
  type RelationState,
} from '@/components/hudTheme'

const semanticTokens = [
  { label: '--bg-space', value: 'var(--bg-space)' },
  { label: '--bg-panel', value: 'var(--bg-panel)' },
  { label: '--bg-panel-strong', value: 'var(--bg-panel-strong)' },
  { label: '--border-glow', value: 'var(--border-glow)' },
  { label: '--text-primary', value: 'var(--text-primary)' },
  { label: '--text-muted', value: 'var(--text-muted)' },
  { label: '--text-warn', value: 'var(--text-warn)' },
  { label: '--text-hostile', value: 'var(--text-hostile)' },
]

const relationStates: RelationState[] = ['hostile', 'neutral', 'friendly', 'ally']

function GlyphIcon({
  kind,
}: {
  kind: 'arrow' | 'alert' | 'shield'
}) {
  if (kind === 'alert') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 16h.01" />
      </svg>
    )
  }

  if (kind === 'shield') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
        <path d="M12 3 19 6v6c0 4.4-3 8.3-7 9-4-.7-7-4.6-7-9V6l7-3Z" />
        <path d="M8.5 12h7" />
      </svg>
    )
  }

  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
      <path d="M5 12h12" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

function FactionSwatch({ factionId }: { factionId: (typeof factionIds)[number] }) {
  const tokens = factionTokens[factionId]

  return (
    <div
      className="border px-4 py-4 shadow-glow-sm"
      style={{
        borderColor: tokens.glow,
        background: 'var(--bg-panel)',
        '--border-glow': tokens.glow,
      } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            {factionId}
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-primary)]">
            {factionLabels[factionId]}
          </p>
        </div>
        <StatusBadge state="neutral">TOKEN</StatusBadge>
      </div>

      <div className="mt-4 grid gap-2">
        {[
          ['Primary', tokens.primary],
          ['Glow', tokens.glow],
          ['Shadow', tokens.shadow],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
            <span className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              {label}
            </span>
            <div className="h-3 border border-[color:var(--border-glow)]" style={{ background: value }} />
            <code className="font-mono text-[0.68rem] text-[color:var(--text-muted)]">{value}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [counter, setCounter] = useState(48290)
  const currentPath = typeof window === 'undefined' ? '/' : window.location.pathname

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCounter((value) => value + 137)
    }, 1250)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--bg-space)] text-[color:var(--text-primary)]">
      <Scanlines />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <GlowPanel className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-hud text-[0.68rem] uppercase tracking-[0.34em] text-[color:var(--text-muted)]">
                DESIGN SYSTEM
              </p>
              <h1 className="mt-2 text-3xl leading-none text-[color:var(--text-primary)] sm:text-4xl">
                外交风云
              </h1>
              <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[color:var(--text-muted)]">
                AI Diplomacy / HUD tokens / faction palettes / base components
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <StatusBadge state="neutral">{currentPath}</StatusBadge>
              <StatusBadge state="ally">VALIDATION VIEW</StatusBadge>
            </div>
          </div>
        </GlowPanel>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <GlowPanel className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                  TOKENS
                </p>
                <h2 className="mt-2 text-xl leading-none">Semantic Surface</h2>
              </div>
              <StatusBadge state="neutral">CSS VARS</StatusBadge>
            </div>

            <HoloDivider className="my-4" />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {semanticTokens.map((token) => (
                <div
                  key={token.label}
                  className="border border-[color:rgba(255,255,255,0.12)] bg-[color:var(--bg-panel-strong)] p-3"
                >
                  <p className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    {token.label}
                  </p>
                  <p className="mt-2 break-all font-mono text-[0.72rem] text-[color:var(--text-primary)]">
                    {token.value}
                  </p>
                </div>
              ))}
            </div>
          </GlowPanel>

          <GlowPanel tone="faction" factionId="starlight" className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                  COUNTER
                </p>
                <h2 className="mt-2 text-xl leading-none">Scroll Number</h2>
              </div>
              <StatusBadge state="friendly">LIVE</StatusBadge>
            </div>

            <HoloDivider className="my-4" />

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="border border-[color:var(--border-glow)] bg-[color:var(--bg-panel-strong)] p-4">
                <p className="font-hud text-[0.64rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                  SIGNAL
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <ScrollNumber className="text-4xl leading-none text-[color:var(--text-primary)]" value={counter} />
                  <span className="pb-1 font-hud text-[0.68rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    units
                  </span>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="border border-[color:rgba(255,255,255,0.12)] bg-[color:var(--bg-panel)] p-4">
                  <p className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    RELATION
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relationStates.map((state) => (
                      <StatusBadge key={state} state={state}>
                        {relationLabels[state]}
                      </StatusBadge>
                    ))}
                  </div>
                </div>

                <div className="border border-[color:rgba(255,255,255,0.12)] bg-[color:var(--bg-panel)] p-4">
                  <p className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    LIVE STRIP
                  </p>
                  <div className="mt-3 h-1 w-full bg-[color:rgba(255,255,255,0.08)]">
                    <div className="h-full w-2/3 animate-pulse-glow bg-[color:var(--border-glow)]" />
                  </div>
                </div>
              </div>
            </div>
          </GlowPanel>
        </section>

        <GlowPanel className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                FACTIONS
              </p>
              <h2 className="mt-2 text-xl leading-none">Primary / Glow / Shadow</h2>
            </div>
            <StatusBadge state="neutral">8 SETS</StatusBadge>
          </div>

          <HoloDivider className="my-4" />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {factionIds.map((factionId) => (
              <FactionSwatch key={factionId} factionId={factionId} />
            ))}
          </div>
        </GlowPanel>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <GlowPanel className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                  COMPONENTS
                </p>
                <h2 className="mt-2 text-xl leading-none">Core Controls</h2>
              </div>
              <StatusBadge state="ally">HUD</StatusBadge>
            </div>

            <HoloDivider className="my-4" />

            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <PixelButton icon={<GlyphIcon kind="arrow" />}>Primary</PixelButton>
                <PixelButton tone="danger" icon={<GlyphIcon kind="alert" />}>
                  Danger
                </PixelButton>
                <PixelButton tone="ghost" icon={<GlyphIcon kind="shield" />}>
                  Ghost
                </PixelButton>
              </div>

              <div className="flex h-12 items-stretch gap-4">
                <HoloDivider orientation="vertical" className="h-full" />
                <div className="flex flex-col justify-center">
                  <p className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    Divider Horizontal
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {relationStates.map((state) => (
                  <StatusBadge key={state} state={state} />
                ))}
              </div>
            </div>
          </GlowPanel>

          <GlowPanel tone="warn" className="relative p-5">
            <Scanlines />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-hud text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    PANEL
                  </p>
                  <h2 className="mt-2 text-xl leading-none">Overlay Check</h2>
                </div>
                <StatusBadge state="friendly">SCANNING</StatusBadge>
              </div>

              <HoloDivider className="my-4" />

              <div className="grid gap-4">
                <div className="border border-[color:var(--text-warn)] bg-[color:rgba(0,0,0,0.28)] p-4">
                  <p className="font-hud text-[0.62rem] uppercase tracking-[0.24em] text-[color:var(--text-warn)]">
                    OVERLAY
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    Scanlines are mounted in the container and the global body overlay remains active.
                  </p>
                </div>
              </div>
            </div>
          </GlowPanel>
        </section>
      </div>
    </main>
  )
}
