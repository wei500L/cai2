import { useState } from 'react'
import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'
import { PixelButton } from '@/components/PixelButton'

const modes = ['演讲', '密谈', '条约', '军令', '情报'] as const

export function CommandTerminal() {
  const [activeMode, setActiveMode] = useState<(typeof modes)[number]>('演讲')

  return (
    <GlowPanel className="h-full rounded-none">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 font-hud text-[0.64rem] uppercase tracking-[0.2em]">
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              className="border px-3 py-2 text-[color:var(--text-primary)]"
              style={{
                borderColor: mode === activeMode ? 'var(--border-glow)' : 'rgba(255,255,255,0.16)',
                background:
                  mode === activeMode ? 'rgba(51, 170, 255, 0.12)' : 'rgba(255,255,255,0.02)',
                boxShadow:
                  mode === activeMode
                    ? '0 0 0 1px var(--border-glow), 0 0 12px rgba(51,170,255,0.18)'
                    : 'none',
              }}
              onClick={() => setActiveMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <HoloDivider />
        <div className="grid min-h-0 flex-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-h-0 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] p-3">
            <div className="mb-2 text-[0.58rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.46)]">
              指令输入
            </div>
            <textarea
              readOnly
              value="此处预留自然语言指挥输入区，后续接入任务 7 / 9 / 10。"
              className="h-[5.5rem] w-full resize-none border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(0,0,0,0.28)] px-3 py-2 font-hud text-[0.74rem] leading-6 text-[color:var(--text-primary)] outline-none"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-[0.58rem] uppercase tracking-[0.2em] text-[color:rgba(196,228,255,0.5)]">
                占位发送区
              </div>
              <PixelButton tone="primary" className="px-3 py-2 text-[0.58rem] tracking-[0.2em]">
                发送
              </PixelButton>
            </div>
          </div>

          <div className="min-h-0 border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] p-3">
            <div className="mb-3 text-[0.58rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.46)]">
              影响力预估
            </div>
            <div className="h-4 border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(0,0,0,0.3)] p-[2px]">
              <div
                className="h-full"
                style={{
                  width: '42%',
                  background:
                    'linear-gradient(90deg, rgba(51,170,255,0.22) 0%, rgba(51,170,255,0.68) 100%)',
                  boxShadow: '0 0 14px rgba(51,170,255,0.35)',
                }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.68rem] text-[color:var(--text-primary)]">
              <span>当前模式</span>
              <span>{activeMode}</span>
            </div>
            <div className="mt-4 grid gap-2 text-[0.56rem] uppercase tracking-[0.2em] text-[color:rgba(196,228,255,0.46)]">
              <div>输入预留</div>
              <div>发送预留</div>
              <div>反馈预留</div>
            </div>
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
