import type { CommandMode } from './types'

type ContextHintProps = {
  mode: CommandMode
  actorCanDirectIntel: boolean
  disabledReason?: string
}

const hints: Record<CommandMode, string> = {
  speech: '演讲模式：所有势力将听到你的发言，文化影响将被记录。',
  private: '密谈模式：只允许锁定一个势力，通讯链路会估算信任与欺瞒风险。',
  treaty: '条约模式：选择 1 到 3 个势力并发送可修改条约草案。',
  military: '军令模式：选择部队、来源区域、目标区域与战术动作。',
  intel: '情报模式：暗潮商会可直接调用情报网，其它势力将派出密使。',
}

export function ContextHint({ mode, actorCanDirectIntel, disabledReason }: ContextHintProps) {
  const intelSuffix = mode === 'intel' && !actorCanDirectIntel ? ' 当前将消耗 1 行动点派出密使。' : ''

  return (
    <div className="min-w-0 truncate border border-[color:rgba(51,170,255,0.18)] bg-[color:rgba(51,170,255,0.055)] px-3 py-2 font-hud text-[0.62rem] text-[color:rgba(214,238,255,0.78)]">
      {disabledReason ?? `${hints[mode]}${intelSuffix}`}
    </div>
  )
}
