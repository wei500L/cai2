import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { factionMetaStore } from '@/store/factionMetaStore'
import type { FactionId } from '@/types/faction'
import type { TreatyKind } from '@/types'
import { ActionDispatcher } from '@/protocol/dispatcher'
import { useGameStore } from '@/store/gameStore'
import { useUIStore } from '@/store/uiStore'
import { getPhaseLabel, getPhaseUIConfig } from '@/features/phaseSystem/PhaseStateMachine'
import { ContextHint } from './ContextHint'
import { getRateSnapshot } from './RateLimiter'
import { MessageInput } from './MessageInput'
import { ModeTabs } from './ModeTabs'
import { SendButton } from './SendButton'
import { SendFx, type SendFxMode, type SendFxPayload } from './SendFx'
import { TargetSelector } from './TargetSelector'
import {
  commandModeLabels,
  militaryActionLabels,
  treatyKindLabels,
  type CommandMode,
  type CommandSubmission,
  type MilitaryOrder,
} from './types'
import { useToneAnalyzer } from './useToneAnalyzer'

const directIntelFactions = new Set<FactionId>(['darkTide', 'starlight', 'voidChurch'])

const placeholders: Record<CommandMode, string> = {
  speech: '向所有势力发表战略宣言...',
  private: '写下只发送给目标势力的密谈内容...',
  treaty: '修改条约草案，加入期限、代价或边界条件...',
  military: '装甲师向北方平原推进并保持隐蔽...',
  intel: '填写情报需求，例如：调查边境兵力与贸易线弱点...',
}

const defaultMilitary: MilitaryOrder = {
  unitId: '第一装甲师',
  sourceRegionId: '',
  targetRegionId: '',
  action: 'move',
}

function phaseKey(epoch: { id: number; turn: number; phase: string }) {
  return `E${epoch.id}:T${epoch.turn}:${epoch.phase}`
}

function hashText(text: string) {
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function buildTreatyTemplate(
  kind: TreatyKind,
  targets: FactionId[],
  metaById: ReturnType<typeof factionMetaStore.getState>['byId'],
) {
  const names = targets.length ? targets.map((target) => metaById[target]?.name ?? target).join('、') : '目标势力'
  const label = treatyKindLabels[kind]

  return `我们提议与${names}签署${label}条约：即刻冻结敌对行动，开放必要联络线，并在本回合结束前确认执行边界。`
}

function findFactionByText(value: string, factions: FactionId[], metaById: ReturnType<typeof factionMetaStore.getState>['byId']) {
  const normalized = value.trim().toLowerCase()

  return factions.find((id) => id.toLowerCase() === normalized || metaById[id]?.name === value.trim())
}

function getShortcut(
  rawValue: string,
  factions: FactionId[],
  metaById: ReturnType<typeof factionMetaStore.getState>['byId'],
): { mode: CommandMode; targets: FactionId[]; content: string; treatyKind?: TreatyKind } | null {
  const trimmed = rawValue.trim()
  const match = trimmed.match(/^\/(ally|war|trade|spy)\s+(.+)$/i)

  if (match) {
    const target = findFactionByText(match[2], factions, metaById)

    if (!target) {
      return null
    }

    if (match[1].toLowerCase() === 'ally') {
      return {
        mode: 'treaty',
        targets: [target],
        treatyKind: 'alliance',
        content: buildTreatyTemplate('alliance', [target], metaById),
      }
    }

    if (match[1].toLowerCase() === 'trade') {
      return {
        mode: 'treaty',
        targets: [target],
        treatyKind: 'trade',
        content: buildTreatyTemplate('trade', [target], metaById),
      }
    }

    if (match[1].toLowerCase() === 'spy') {
      return {
        mode: 'intel',
        targets: [target],
        content: `请求获取${metaById[target]?.name ?? target}在本回合的兵力调动、贸易线路与外交弱点。`,
      }
    }

    return {
      mode: 'speech',
      targets: [],
      content: `我们正式警告${metaById[target]?.name ?? target}：停止扩张，否则将视为宣战信号。`,
    }
  }

  if (trimmed === '/history') {
    return { mode: 'speech', targets: [], content: '请求调阅上一阶段外交记录，并公开说明关键承诺与违约风险。' }
  }

  if (trimmed === '/status') {
    return { mode: 'speech', targets: [], content: '发布当前国力状态简报，强调稳定、资源与下一步外交窗口。' }
  }

  if (trimmed === '/map') {
    return { mode: 'speech', targets: [], content: '请求全域势力地图同步，标记边境压力、资源节点与潜在冲突线。' }
  }

  return null
}

function formatRateText(used: number, limit: number, label: string) {
  return `${label}额度 ${used}/${limit}`
}

export function CommandTerminal() {
  const epoch = useGameStore((state) => state.epoch)
  const selectedFactionId = useGameStore((state) => state.selectedFactionId)
  const factionStates = useGameStore((state) => state.factions)
  const regions = useGameStore((state) => state.regions)
  const factionMetaById = factionMetaStore((state) => state.byId)
  const factions = useMemo(() => factionStates.map((faction) => faction.id), [factionStates])
  const actorId = selectedFactionId ?? 'starlight'
  const [mode, setMode] = useState<CommandMode>('speech')
  const [targets, setTargets] = useState<FactionId[]>([])
  const [treatyKind, setTreatyKind] = useState<TreatyKind>('non_aggression')
  const [military, setMilitary] = useState<MilitaryOrder>(defaultMilitary)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [fxPayload, setFxPayload] = useState<SendFxPayload | null>(null)
  const [reboundKey, setReboundKey] = useState(0)
  const pendingSubmission = useRef<CommandSubmission | null>(null)
  const appliedDraftId = useRef<number | null>(null)
  const commandTerminalDraft = useUIStore((state) => state.commandTerminalDraft)
  const commandModeHotkey = useUIStore((state) => state.commandModeHotkey)
  const setCommandModeHotkey = useUIStore((state) => state.setCommandModeHotkey)
  const hudMode = useUIStore((state) => state.hudMode)
  const phaseConfig = getPhaseUIConfig(hudMode)
  const tone = useToneAnalyzer(content, mode)
  const isActionPhase = epoch.phase === 'action' && phaseConfig.commandTerminalMode === 'expanded'
  const actorCanDirectIntel = directIntelFactions.has(actorId)
  const resolvedMilitary = useMemo(() => {
    const ownedRegion = regions.find((region) => region.owner === actorId)
    const fallbackSource = ownedRegion?.id ?? regions[0]?.id ?? ''
    const fallbackTarget = regions.find((region) => region.id !== fallbackSource)?.id ?? fallbackSource

    return {
      ...military,
      sourceRegionId: military.sourceRegionId || fallbackSource,
      targetRegionId: military.targetRegionId || fallbackTarget,
    }
  }, [actorId, military, regions])
  const rateSnapshot = getRateSnapshot({
    phaseKey: phaseKey(epoch),
    playerId: actorId,
    mode,
  })
  const reactionPreview = useMemo(() => {
    const target = targets[0]

    if (mode !== 'private' || !target) {
      return null
    }

    return (['接受', '犹豫', '拒绝'] as const)[hashText(`${actorId}:${target}:${epoch.id}:${epoch.turn}`) % 3]
  }, [actorId, epoch.id, epoch.turn, mode, targets])

  const setModeSafely = useCallback(
    (nextMode: CommandMode) => {
      setMode(nextMode)
      setError('')

      if (nextMode === 'speech' || nextMode === 'military') {
        setTargets([])
      } else if (targets.length > (nextMode === 'treaty' ? 3 : 1)) {
        setTargets(targets.slice(0, nextMode === 'treaty' ? 3 : 1))
      }

      if (nextMode === 'treaty' && !content.trim()) {
        setContent(buildTreatyTemplate(treatyKind, targets.slice(0, 3), factionMetaById))
      }
    },
    [content, factionMetaById, targets, treatyKind],
  )

  useEffect(() => {
    if (!commandTerminalDraft || appliedDraftId.current === commandTerminalDraft.id) {
      return
    }

    appliedDraftId.current = commandTerminalDraft.id
    const frame = window.requestAnimationFrame(() => {
      setMode(commandTerminalDraft.mode)
      setError('')

      if (commandTerminalDraft.mode === 'speech' || commandTerminalDraft.mode === 'military') {
        setTargets([])
      } else {
        setTargets(commandTerminalDraft.targets.slice(0, commandTerminalDraft.mode === 'treaty' ? 3 : 1))
      }

      if (commandTerminalDraft.treatyKind) {
        setTreatyKind(commandTerminalDraft.treatyKind)
      }

      setContent(commandTerminalDraft.content)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [commandTerminalDraft])

  useEffect(() => {
    if (!commandModeHotkey) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      setModeSafely(commandModeHotkey)
      setCommandModeHotkey(null)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [commandModeHotkey, setCommandModeHotkey, setModeSafely])

  const handleContentChange = useCallback(
    (value: string) => {
      const shortcut = getShortcut(value, factions, factionMetaById)

      if (shortcut) {
        setMode(shortcut.mode)
        setTargets(shortcut.targets)
        setContent(shortcut.content)
        setError('')

        if (shortcut.treatyKind) {
          setTreatyKind(shortcut.treatyKind)
        }

        return
      }

      setContent(value)
      setError('')
    },
    [factionMetaById, factions],
  )

  const handleTreatyKindChange = useCallback(
    (kind: TreatyKind) => {
      setTreatyKind(kind)

      if (mode === 'treaty' && (!content.trim() || Object.values(treatyKindLabels).some((label) => content.includes(label)))) {
        setContent(buildTreatyTemplate(kind, targets, factionMetaById))
      }
    },
    [content, factionMetaById, mode, targets],
  )

  const handleMilitaryChange = useCallback(
    (order: MilitaryOrder) => {
      setMilitary(order)

      if (!content.trim()) {
        setContent(`${order.unitId}${militaryActionLabels[order.action]}至${order.targetRegionId || '目标区域'}，保持通讯静默并回报接敌状态。`)
      }
    },
    [content],
  )

  const disabledReason = isActionPhase ? undefined : '等待行动期开始'
  const canSubmitContext =
    mode === 'speech' ||
    (mode === 'private' && targets.length === 1) ||
    (mode === 'treaty' && targets.length >= 1 && targets.length <= 3) ||
    (mode === 'military' &&
      Boolean(
        resolvedMilitary.unitId &&
          resolvedMilitary.sourceRegionId &&
          resolvedMilitary.targetRegionId &&
          resolvedMilitary.action,
      )) ||
    (mode === 'intel' && targets.length === 1)
  const sendDisabled =
    !isActionPhase || isAnimating || rateSnapshot.blocked || !content.trim() || !canSubmitContext
  const rateLabel = mode === 'military' ? '军令' : mode === 'intel' ? '情报' : '发言'
  const statusText = error || formatRateText(rateSnapshot.used, rateSnapshot.limit, rateLabel)

  const handleSubmit = useCallback(() => {
    if (sendDisabled) {
      setError(!isActionPhase ? '等待行动期开始' : rateSnapshot.blocked ? '本阶段发送额度已用尽' : '补全目标或指令内容')
      return
    }

    const submission: CommandSubmission = {
      mode,
      content,
      targets: mode === 'speech' || mode === 'military' ? [] : targets,
      treatyKind: mode === 'treaty' ? treatyKind : undefined,
      military: mode === 'military' ? resolvedMilitary : undefined,
      tone: {
        heat: tone.heat,
        label: tone.label,
        isAggressive: tone.isAggressive,
      },
    }
    const fxMode: SendFxMode = tone.isAggressive ? 'aggressive' : mode === 'speech' ? 'speech' : 'private'

    pendingSubmission.current = submission
    setIsAnimating(true)
    setFxPayload({ id: Date.now(), mode: fxMode, text: content })
  }, [content, isActionPhase, mode, rateSnapshot.blocked, resolvedMilitary, sendDisabled, targets, tone, treatyKind])

  const handleFxComplete = useCallback(() => {
    const submission = pendingSubmission.current
    pendingSubmission.current = null
    setFxPayload(null)
    setIsAnimating(false)

    if (!submission) {
      return
    }

    const result = ActionDispatcher.submitSpeech(submission)

    if (!result.ok) {
      setError(result.error ?? '发送失败')
      return
    }

    setContent('')
    setError('')
    setReboundKey((value) => value + 1)
  }, [])

  if (!phaseConfig.commandTerminalVisible || phaseConfig.commandTerminalMode === 'hidden') {
    return null
  }

  if (phaseConfig.commandTerminalMode === 'collapsed') {
    return (
      <GlowPanel className="h-full rounded-none">
        <div className="flex h-full items-center justify-between gap-3 px-4 font-hud">
          <div className="min-w-0">
            <div className="truncate text-[0.68rem] uppercase tracking-[0.2em] text-[color:var(--text-primary)]">
              CommandTerminal / standby
            </div>
            <div className="mt-1 truncate text-[0.54rem] tracking-[0.14em] text-[color:rgba(196,228,255,0.46)]">
              {getPhaseLabel(hudMode)}期不可输入，行动期自动展开
            </div>
          </div>
          <div className="flex-none border border-[color:rgba(255,204,102,0.28)] bg-[color:rgba(255,204,102,0.07)] px-3 py-1.5 text-[0.56rem] tracking-[0.16em] text-[color:var(--text-warn)]">
            INPUT LOCKED
          </div>
        </div>
      </GlowPanel>
    )
  }

  return (
    <GlowPanel className="h-full rounded-none">
      <div className="relative flex h-full flex-col">
        <SendFx payload={fxPayload} onComplete={handleFxComplete} />
        <div className="flex min-w-0 items-center gap-3 px-4 py-2 max-sm:flex-wrap max-sm:px-3">
          <ModeTabs activeMode={mode} onModeChange={setModeSafely} />
          <div className="min-w-0 flex-1">
            <ContextHint mode={mode} actorCanDirectIntel={actorCanDirectIntel} disabledReason={disabledReason} />
          </div>
          {reactionPreview ? (
            <div className="h-8 flex-none border border-[color:rgba(255,204,102,0.32)] bg-[color:rgba(255,204,102,0.08)] px-3 py-2 font-hud text-[0.56rem] uppercase tracking-[0.16em] text-[color:var(--text-warn)]">
              目标反应：{reactionPreview}
            </div>
          ) : null}
        </div>
        <HoloDivider />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(21rem,30rem)] gap-3 px-4 py-3 max-sm:grid-cols-1 max-sm:overflow-y-auto max-sm:px-3 max-sm:py-2">
          <div className="grid min-h-0 grid-rows-[2rem_minmax(0,1fr)] gap-2">
            <TargetSelector
              mode={mode}
              actorId={actorId}
              factions={factions}
              regions={regions}
              targets={targets}
              treatyKind={treatyKind}
              military={resolvedMilitary}
              onTargetsChange={setTargets}
              onTreatyKindChange={handleTreatyKindChange}
              onMilitaryChange={handleMilitaryChange}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3 max-sm:grid-cols-1">
              <div className="truncate border border-[color:rgba(255,255,255,0.1)] bg-[color:rgba(255,255,255,0.025)] px-3 py-2 font-hud text-[0.58rem] uppercase tracking-[0.14em] text-[color:rgba(196,228,255,0.52)]">
                通讯协议：{commandModeLabels[mode]}
              </div>
              <SendButton
                aggressive={tone.isAggressive}
                disabled={sendDisabled}
                statusText={statusText}
                onClick={handleSubmit}
              />
            </div>
          </div>
          <MessageInput
            content={content}
            mode={mode}
            tone={tone}
            disabled={!isActionPhase || isAnimating}
            reboundKey={reboundKey}
            placeholder={placeholders[mode]}
            onChange={handleContentChange}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </GlowPanel>
  )
}
