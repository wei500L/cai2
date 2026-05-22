import { GlowPanel } from '@/components/GlowPanel'
import { EffectsLayer } from '@/effects/EffectsLayer'
import { PublicSpeechBubble } from '@/features/aiSpeech/PublicSpeechBubble'
import { ReactionTag } from '@/features/aiSpeech/ReactionTag'
import { motion } from 'framer-motion'
import type { FactionId } from '@/mock/factions'
import type { GameEvent } from '@/mock/types'
import { MapStage2D } from '@/render/MapStage2D'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { getPhaseUIConfig } from '@/features/phaseSystem/PhaseStateMachine'

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
  const mapQuality = useUIStore((state) => state.mapQuality)
  const hudMode = useUIStore((state) => state.hudMode)
  const phaseConfig = getPhaseUIConfig(hudMode)
  const allowFloatingSpeech = epoch.phase !== 'arbitrate'
  const latestSpeech = allowFloatingSpeech ? events.find((event) => getPublicSpeechText(event)) : null
  const latestReaction = allowFloatingSpeech ? events.find((event) => getReactionLabel(event)) : null
  const MapRenderer = MapStage2D

  return (
    <GlowPanel className="h-full w-full rounded-none">
      <div className="relative flex h-full min-h-[18rem] items-center justify-center overflow-hidden">
        <motion.div
          className="absolute inset-0"
          animate={{ scale: phaseConfig.mapZoom }}
          transition={{ duration: phaseConfig.transitionMs / 1000, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'center' }}
        >
          <MapRenderer />
        </motion.div>
        {phaseConfig.borderSparkBoost > 1 ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 border-2 border-[color:rgba(255,102,102,0.56)]"
            animate={{
              opacity: [0.35, 0.92, 0.35],
              boxShadow: [
                'inset 0 0 28px rgba(255,102,102,0.18), 0 0 18px rgba(255,102,102,0.2)',
                'inset 0 0 48px rgba(255,102,102,0.36), 0 0 38px rgba(255,102,102,0.34)',
                'inset 0 0 28px rgba(255,102,102,0.18), 0 0 18px rgba(255,102,102,0.2)',
              ],
            }}
            transition={{ duration: 0.9 / phaseConfig.borderSparkBoost, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}
        <div className="pointer-events-none absolute left-3 top-3 z-20 border border-[color:rgba(196,228,255,0.16)] bg-[color:rgba(1,3,8,0.68)] px-2 py-1 font-hud text-[0.52rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.58)]">
          MAP / CANVAS2D / {mapQuality} / Z{phaseConfig.mapZoom.toFixed(2)}
        </div>
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-[color:rgba(196,228,255,0.04)]" />
          <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-[color:rgba(196,228,255,0.04)]" />
          <div
            className="absolute inset-[7%] border border-[color:rgba(51,170,255,0.08)]"
            style={{ boxShadow: 'inset 0 0 38px rgba(51,170,255,0.06)' }}
          />
          <div
            className="absolute inset-[15%] border border-[color:rgba(255,255,255,0.05)]"
            style={{ boxShadow: '0 0 44px rgba(255,204,102,0.035)' }}
          />
        </div>
        <EffectsLayer mapQuality={mapQuality} />
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
