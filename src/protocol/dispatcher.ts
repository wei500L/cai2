import type { CommandSubmission, SubmitSpeechResult } from '@/features/commandTerminal/types'
import type { FactionId } from '@/mock/factions'
import { gameStoreApi } from '@/store/gameStore'
import type { OutgoingMessage } from './types'
import type { Transport } from './transport'

const DEFAULT_ROOM_ID = 'mock-room'

let outboundSequence = 0

function nextMessageId(type: string) {
  return `${type}_${Date.now()}_${outboundSequence}`
}

function envelope<T extends OutgoingMessage['t']>(
  type: T,
  payload: Extract<OutgoingMessage, { t: T }>['p'],
): Extract<OutgoingMessage, { t: T }> {
  outboundSequence += 1

  return {
    v: 1,
    id: nextMessageId(type),
    t: type,
    ts: Date.now(),
    seq: outboundSequence,
    p: payload,
  } as Extract<OutgoingMessage, { t: T }>
}

function validateSubmission(submission: CommandSubmission) {
  const content = submission.content.trim()

  if (!content) {
    return '指令内容不能为空'
  }

  if (content.length > 400) {
    return '指令内容超过 400 字'
  }

  if (submission.mode === 'private' && submission.targets.length !== 1) {
    return '密谈必须选择且仅选择一个目标势力'
  }

  if (submission.mode === 'treaty') {
    if (submission.targets.length < 1 || submission.targets.length > 3) {
      return '条约必须选择 1 到 3 个目标势力'
    }

    if (!submission.treatyKind) {
      return '条约必须选择条约种类'
    }
  }

  if (submission.mode === 'military') {
    if (
      !submission.military?.unitId ||
      !submission.military.sourceRegionId ||
      !submission.military.targetRegionId ||
      !submission.military.action
    ) {
      return '军令必须包含部队、来源区域、目标区域与动作'
    }
  }

  if (submission.mode === 'intel' && submission.targets.length !== 1) {
    return '情报模式必须选择一个目标势力'
  }

  return null
}

function getActor(): FactionId {
  return gameStoreApi.getState().selectedFactionId ?? 'starlight'
}

function getRoomId() {
  const state = gameStoreApi.getState()
  return state.currentRoomId ?? DEFAULT_ROOM_ID
}

function buildOutgoingMessage(submission: CommandSubmission): OutgoingMessage {
  const actor = getActor()
  const roomId = getRoomId()
  const metadata = {
    player_faction: actor,
    tone: submission.tone,
    mode: submission.mode,
  }

  if (submission.mode === 'private') {
    return envelope('action.private', {
      room_id: roomId,
      target_faction: submission.targets[0],
      content: submission.content.trim(),
      metadata,
    })
  }

  if (submission.mode === 'treaty') {
    return envelope('action.treaty', {
      room_id: roomId,
      treaty_kind: submission.treatyKind ?? 'non_aggression',
      target_factions: submission.targets,
      proposal_text: submission.content.trim(),
      metadata,
    })
  }

  if (submission.mode === 'military') {
    return envelope('action.military', {
      room_id: roomId,
      source_region: submission.military?.sourceRegionId ?? '',
      target_region: submission.military?.targetRegionId ?? '',
      movement: submission.military?.action ?? 'move',
      orders_text: submission.content.trim(),
      unit_id: submission.military?.unitId,
      metadata,
    })
  }

  if (submission.mode === 'intel') {
    return envelope('action.intel', {
      room_id: roomId,
      target_faction: submission.targets[0],
      intel_kind: 'spy',
      brief: submission.content.trim(),
      metadata,
    })
  }

  return envelope('action.speak', {
    room_id: roomId,
    mode: 'speech',
    content: submission.content.trim(),
    targets: submission.targets,
    metadata,
  })
}

export class ActionDispatcher {
  private static transport: Transport | null = null

  static setTransport(transport: Transport | null) {
    ActionDispatcher.transport = transport
  }

  static submitSpeech(submission: CommandSubmission): SubmitSpeechResult {
    const state = gameStoreApi.getState()

    if (state.epoch.phase !== 'action') {
      return { ok: false, error: '等待行动期开始' }
    }

    const validationError = validateSubmission(submission)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    if (!ActionDispatcher.transport) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    const result = ActionDispatcher.transport.send(buildOutgoingMessage(submission))
    return result ?? { ok: true }
  }

  static joinRoom(roomId: string, displayName: string): SubmitSpeechResult {
    if (!ActionDispatcher.transport) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    const result = ActionDispatcher.transport.send(
      envelope('room.join', {
        room_id: roomId,
        display_name: displayName,
      }),
    )

    return result ?? { ok: true }
  }

  static selectFaction(factionId: FactionId): SubmitSpeechResult {
    if (!ActionDispatcher.transport) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    const result = ActionDispatcher.transport.send(
      envelope('room.select_faction', {
        room_id: getRoomId(),
        faction_id: factionId,
      }),
    )

    return result ?? { ok: true }
  }

  static setReady(ready: boolean): SubmitSpeechResult {
    if (!ActionDispatcher.transport) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    const result = ActionDispatcher.transport.send(
      envelope('room.ready', {
        room_id: getRoomId(),
        ready,
      }),
    )

    return result ?? { ok: true }
  }

  static requestNextEpoch(): SubmitSpeechResult {
    if (!ActionDispatcher.transport) {
      return { ok: false, error: '协议通道尚未连接' }
    }

    const result = ActionDispatcher.transport.send(
      envelope('room.ready', {
        room_id: getRoomId(),
        ready: true,
      }),
    )

    return result ?? { ok: true }
  }
}
