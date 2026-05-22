import clsx from 'clsx'
import { factionTokens } from '@/components/hudTheme'
import { factionById, type FactionId } from '@/mock/factions'
import type { MapRegion, TreatyKind } from '@/mock/types'
import {
  militaryActionLabels,
  treatyKindLabels,
  type CommandMode,
  type MilitaryAction,
  type MilitaryOrder,
} from './types'

type TargetSelectorProps = {
  mode: CommandMode
  actorId: FactionId
  factions: FactionId[]
  regions: MapRegion[]
  targets: FactionId[]
  treatyKind: TreatyKind
  military: MilitaryOrder
  onTargetsChange: (targets: FactionId[]) => void
  onTreatyKindChange: (kind: TreatyKind) => void
  onMilitaryChange: (order: MilitaryOrder) => void
}

const regionTerrainLabels: Record<MapRegion['terrain'], string> = {
  mountain: '山地',
  plains: '平原',
  river: '河网',
  fortress: '要塞',
  desert: '荒漠',
}

const unitLabels = ['第一装甲师', '边境守备队', '快速突击群']

function regionLabel(region: MapRegion) {
  return `${region.id.replace('region_', 'R-')} ${regionTerrainLabels[region.terrain]}`
}

export function TargetSelector({
  mode,
  actorId,
  factions,
  regions,
  targets,
  treatyKind,
  military,
  onTargetsChange,
  onTreatyKindChange,
  onMilitaryChange,
}: TargetSelectorProps) {
  const availableFactions = factions.filter((id) => id !== actorId)
  const ownedRegions = regions.filter((region) => region.owner === actorId)
  const targetRegions = regions.slice(0, 16)

  if (mode === 'speech') {
    return (
      <div className="flex h-full items-center border border-dashed border-[color:rgba(51,170,255,0.2)] bg-[color:rgba(51,170,255,0.04)] px-3 font-hud text-[0.58rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.5)]">
        全域广播 · 目标列表禁用
      </div>
    )
  }

  if (mode === 'military') {
    return (
      <div className="grid h-full grid-cols-4 gap-2">
        <select
          value={military.unitId}
          onChange={(event) => onMilitaryChange({ ...military, unitId: event.target.value })}
          className="min-w-0 border border-[color:rgba(255,255,255,0.14)] bg-black/40 px-2 font-hud text-[0.58rem] text-[color:var(--text-primary)] outline-none"
          aria-label="选择部队"
        >
          {unitLabels.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <select
          value={military.sourceRegionId}
          onChange={(event) => onMilitaryChange({ ...military, sourceRegionId: event.target.value })}
          className="min-w-0 border border-[color:rgba(255,255,255,0.14)] bg-black/40 px-2 font-hud text-[0.58rem] text-[color:var(--text-primary)] outline-none"
          aria-label="选择来源区域"
        >
          {(ownedRegions.length ? ownedRegions : regions.slice(0, 8)).map((region) => (
            <option key={region.id} value={region.id}>
              {regionLabel(region)}
            </option>
          ))}
        </select>
        <select
          value={military.targetRegionId}
          onChange={(event) => onMilitaryChange({ ...military, targetRegionId: event.target.value })}
          className="min-w-0 border border-[color:rgba(255,255,255,0.14)] bg-black/40 px-2 font-hud text-[0.58rem] text-[color:var(--text-primary)] outline-none"
          aria-label="选择目标区域"
        >
          {targetRegions.map((region) => (
            <option key={region.id} value={region.id}>
              {regionLabel(region)}
            </option>
          ))}
        </select>
        <select
          value={military.action}
          onChange={(event) =>
            onMilitaryChange({ ...military, action: event.target.value as MilitaryAction })
          }
          className="min-w-0 border border-[color:rgba(255,255,255,0.14)] bg-black/40 px-2 font-hud text-[0.58rem] text-[color:var(--text-primary)] outline-none"
          aria-label="选择军令动作"
        >
          {Object.entries(militaryActionLabels).map(([action, label]) => (
            <option key={action} value={action}>
              {label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 items-center gap-2 overflow-x-auto">
      {mode === 'treaty' ? (
        <select
          value={treatyKind}
          onChange={(event) => onTreatyKindChange(event.target.value as TreatyKind)}
          className="h-8 flex-none border border-[color:rgba(255,255,255,0.14)] bg-black/40 px-2 font-hud text-[0.58rem] text-[color:var(--text-primary)] outline-none"
          aria-label="选择条约种类"
        >
          {Object.entries(treatyKindLabels).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      ) : null}

      {availableFactions.map((id) => {
        const selected = targets.includes(id)
        const disabled = mode === 'treaty' && !selected && targets.length >= 3

        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            className={clsx(
              'h-8 flex-none border px-2 font-hud text-[0.58rem] tracking-[0.12em] transition-[opacity,border-color,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-35',
              selected ? 'bg-[color:rgba(51,170,255,0.14)]' : 'bg-[color:rgba(255,255,255,0.025)]',
            )}
            style={{
              borderColor: selected ? factionTokens[id].glow : 'rgba(255,255,255,0.14)',
              color: selected ? factionTokens[id].glow : 'var(--text-primary)',
            }}
            onClick={() => {
              if (mode === 'private' || mode === 'intel') {
                onTargetsChange([id])
                return
              }

              onTargetsChange(selected ? targets.filter((target) => target !== id) : [...targets, id])
            }}
          >
            {factionById[id].name}
          </button>
        )
      })}
    </div>
  )
}
