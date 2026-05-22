import { memo, useCallback, useMemo, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { ScrollNumber } from '@/components/ScrollNumber'
import { StatusBadge } from '@/components/StatusBadge'
import { factionById, type FactionId } from '@/mock/factions'
import type { Relationship, TreatyKind } from '@/mock/types'
import { useGameStore } from '@/store/gameStore'
import {
  getRelationStatus,
  getStatusStyle,
  getTreatyTurnsLeft,
  statusLabels,
} from './relationVisuals'
import { FactionRowDetail } from './FactionRowDetail'
import type { ContextMenuState, RelationDelta, TreatyDisplay } from './types'

type FactionRowProps = {
  actorId: FactionId
  factionId: FactionId
  delta?: RelationDelta
  onFocusFaction: (factionId: FactionId) => void
  onOpenModal: (factionId: FactionId) => void
  onOpenMenu: (state: ContextMenuState) => void
}

function getSelfRelationship(actorId: FactionId): Relationship {
  return {
    from: actorId,
    to: actorId,
    value: 100,
    status: 'allied',
    treaties: [],
  }
}

function treatyDisplay(
  treaties: TreatyKind[],
  actorId: FactionId,
  factionId: FactionId,
  turn: number,
): TreatyDisplay[] {
  return treaties.map((kind) => ({
    kind,
    turnsLeft: getTreatyTurnsLeft(kind, actorId, factionId, turn),
  }))
}

function FactionRowComponent({
  actorId,
  factionId,
  delta,
  onFocusFaction,
  onOpenModal,
  onOpenMenu,
}: FactionRowProps) {
  const isSelf = actorId === factionId
  const relationship =
    useGameStore(
      useCallback(
        (state) =>
          state.relationships.find(
            (item) => item.from === actorId && item.to === factionId,
          ),
        [actorId, factionId],
      ),
    ) ?? getSelfRelationship(actorId)
  const factionState = useGameStore(
    useCallback((state) => state.factions.find((item) => item.id === factionId), [factionId]),
  )
  const turn = useGameStore((state) => state.epoch.turn)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const faction = factionById[factionId]
  const status = getRelationStatus(relationship.value)
  const detailOpen = hovered || pinned
  const treaties = useMemo(
    () => treatyDisplay(relationship.treaties, actorId, factionId, turn),
    [actorId, factionId, relationship.treaties, turn],
  )

  const rowStyle = {
    '--row-glow': faction.glow,
    '--row-shadow': faction.shadow,
    '--row-primary': faction.primary,
  } as CSSProperties

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    onOpenMenu({
      factionId,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 190),
    })
  }

  if (!factionState) {
    return null
  }

  return (
    <motion.div
      layout="position"
      className={clsx(
        'relative overflow-hidden border bg-[color:rgba(255,255,255,0.025)] transition-colors duration-150',
        detailOpen ? 'border-[color:var(--row-glow)]' : 'border-[color:rgba(255,255,255,0.08)]',
      )}
      style={rowStyle}
      animate={
        delta
          ? {
              boxShadow: [
                `0 0 0 1px rgba(255,255,255,0.02), 0 0 0 rgba(0,0,0,0)`,
                `0 0 0 1px var(--row-glow), 0 0 24px var(--row-shadow)`,
                `0 0 0 1px rgba(255,255,255,0.02), 0 0 0 rgba(0,0,0,0)`,
              ],
            }
          : undefined
      }
      transition={{ duration: 0.6, ease: 'easeOut' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        setPinned((current) => !current)
        onFocusFaction(factionId)
      }}
      onDoubleClick={() => onOpenModal(factionId)}
      onContextMenu={handleContextMenu}
    >
      <div className="grid h-16 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3">
        <div
          className="grid h-10 w-10 place-items-center border"
          style={{
            borderColor: faction.glow,
            background: `radial-gradient(circle at 38% 28%, rgba(255,255,255,0.8), ${faction.primary} 28%, transparent 68%)`,
            boxShadow: `0 0 18px ${faction.shadow}`,
          }}
        >
          <span className="font-hud text-[0.62rem] text-black/75">
            {faction.name.slice(0, 1)}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[0.78rem] text-[color:var(--text-primary)]">
              {faction.name}
            </div>
            {isSelf ? (
              <span className="flex-none font-hud text-[0.52rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.42)]">
                PLAYER
              </span>
            ) : null}
          </div>
          <motion.div
            className="mt-1 inline-flex"
            animate={
              delta?.enteredHostile
                ? {
                    x: [0, -2, 2, -1, 1, 0],
                    filter: [
                      'drop-shadow(0 0 0 rgba(255,64,64,0))',
                      'drop-shadow(0 0 10px rgba(255,64,64,0.85))',
                      'drop-shadow(0 0 0 rgba(255,64,64,0))',
                    ],
                  }
                : undefined
            }
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <StatusBadge
              state={status === 'allied' ? 'ally' : status === 'friendly' ? 'friendly' : status === 'hostile' ? 'hostile' : 'neutral'}
              className="px-2 py-0.5 text-[0.56rem] tracking-[0.14em]"
              style={getStatusStyle(status)}
            >
              {statusLabels[status]}
            </StatusBadge>
          </motion.div>
        </div>

        <ScrollNumber
          value={relationship.value}
          duration={0.6}
          className={clsx(
            'min-w-[3.4rem] justify-end text-right text-[1.05rem]',
            delta?.direction === 1 && 'text-[color:rgb(126,241,246)]',
            delta?.direction === -1 && 'text-[color:rgb(255,132,132)]',
          )}
          format={(value) => (value > 0 ? `+${value}` : `${value}`)}
        />
      </div>

      <AnimatePresence initial={false}>
        {detailOpen ? (
          <FactionRowDetail
            faction={faction}
            factionState={factionState}
            treaties={treaties}
            isSelf={isSelf}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

export const FactionRow = memo(FactionRowComponent)
