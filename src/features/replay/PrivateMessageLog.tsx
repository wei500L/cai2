import { factionTokens } from '@/components/hudTheme'
import type { PrivateMessage } from '@/types'
import { formatReplayTime, getFactionName } from './replayViewUtils'

type PrivateMessageLogProps = {
  messages: PrivateMessage[]
}

export function PrivateMessageLog({ messages }: PrivateMessageLogProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border border-[color:rgba(255,204,102,0.18)] bg-[color:rgba(12,7,4,0.82)]">
      <div className="border-b border-[color:rgba(255,204,102,0.16)] px-3 py-2">
        <div className="font-hud text-sm text-[color:var(--text-warn)]">密谈记录全解密</div>
        <div className="text-[0.68rem] text-[color:rgba(212,227,235,0.52)]">{messages.length} 条加密通道记录</div>
      </div>
      <div className="event-stream-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="border border-dashed border-[color:rgba(255,204,102,0.22)] p-4 text-sm text-[color:rgba(212,227,235,0.58)]">
            本局没有留下密谈记录。
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className="border bg-black/28 p-3"
                style={{ borderColor: factionTokens[message.from].glow }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-hud text-xs text-white">
                      {getFactionName(message.from)} {'->'} {getFactionName(message.to)}
                    </div>
                    <div className="font-hud text-[0.6rem] text-[color:rgba(212,227,235,0.46)]">
                      {formatReplayTime(message.epoch, message.turn, message.phase)}
                    </div>
                  </div>
                  <span className="border border-[color:rgba(153,51,255,0.35)] bg-[color:rgba(153,51,255,0.16)] px-1.5 py-0.5 font-hud text-[0.56rem] text-[color:rgba(220,196,255,0.86)]">
                    {message.encrypted ? 'ENCRYPTED' : 'OPEN'}
                  </span>
                </div>
                <div className="mb-1 font-hud text-[0.7rem] text-[color:var(--text-warn)]">{message.subject}</div>
                <p className="text-xs leading-5 text-[color:rgba(244,251,255,0.74)]">{message.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
