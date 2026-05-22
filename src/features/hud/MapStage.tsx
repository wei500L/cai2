import { GlowPanel } from '@/components/GlowPanel'
import { PublicSpeechBubble } from '@/features/aiSpeech/PublicSpeechBubble'
import { ReactionTag } from '@/features/aiSpeech/ReactionTag'
import type { FactionId } from '@/mock/factions'
import type { GameEvent } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'

function getPublicSpeechText(event: GameEvent) {
  if (event.kind !== 'speech' || !event.actor || event.payload.channel !== 'public') {
    return null
  }

  return typeof event.payload.text === 'string' ? event.payload.text : event.narration
}

function getReactionLabel(event: GameEvent) {
  if (event.kind !== 'reaction' || !event.actor) {
    return null
  }

  return typeof event.payload.label === 'string' ? event.payload.label : event.narration
}

export function MapStage() {
  const epoch = useGameStore((state) => state.epoch)
  const events = useGameStore((state) => state.events)
  const allowFloatingSpeech = epoch.phase !== 'arbitrate'
  const latestSpeech = allowFloatingSpeech ? events.find((event) => getPublicSpeechText(event)) : null
  const latestReaction = allowFloatingSpeech ? events.find((event) => getReactionLabel(event)) : null

  return (
    <GlowPanel className="h-full w-full rounded-none">
      <div className="relative flex h-full min-h-[18rem] items-center justify-center overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-[10%] border border-[color:rgba(255,255,255,0.08)]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(12,18,28,0.92) 0%, rgba(4,7,12,0.98) 62%, rgba(1,2,5,1) 100%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-[19%] border border-[color:rgba(51,170,255,0.12)]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.88) 0%, rgba(2,4,10,0.96) 70%, rgba(1,1,2,1) 100%)',
            boxShadow: '0 0 0 1px rgba(51,170,255,0.08), 0 0 40px rgba(51,170,255,0.06)',
          }}
        />
        <div
          aria-hidden
          className="absolute h-[1px] w-[32%] bg-[color:rgba(255,255,255,0.08)]"
        />
        <div
          aria-hidden
          className="absolute h-[32%] w-[1px] bg-[color:rgba(255,255,255,0.08)]"
        />
        <div className="relative z-10 grid place-items-center text-center font-hud">
          <div
            className="grid place-items-center border border-[color:rgba(51,170,255,0.18)] bg-[color:rgba(0,0,0,0.42)] text-[color:var(--text-primary)]"
            style={{
              width: 'clamp(18rem, 42vmin, 34rem)',
              height: 'clamp(18rem, 42vmin, 34rem)',
            }}
          >
            <div className="grid gap-2 px-6">
              <div className="text-[0.62rem] uppercase tracking-[0.26em] text-[color:rgba(196,228,255,0.48)]">
                战略地图
              </div>
              <div className="text-[0.92rem] tracking-[0.1em] text-[color:var(--text-primary)]">
                战略地图待接入
              </div>
            </div>
          </div>
        </div>
        {latestSpeech?.actor ? (
          <div className="pointer-events-none absolute left-1/2 top-[18%] z-20 -translate-x-1/2">
            <PublicSpeechBubble
              key={latestSpeech.id}
              actor={latestSpeech.actor as FactionId}
              text={getPublicSpeechText(latestSpeech) ?? ''}
            />
          </div>
        ) : null}
        {latestReaction?.actor ? (
          <div className="pointer-events-none absolute left-1/2 top-[31%] z-30 -translate-x-1/2">
            <ReactionTag
              key={latestReaction.id}
              actor={latestReaction.actor as FactionId}
              label={getReactionLabel(latestReaction) ?? ''}
            />
          </div>
        ) : null}
      </div>
    </GlowPanel>
  )
}
