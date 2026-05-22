import { PixelButton } from '@/components/PixelButton'
import { GlowPanel } from '@/components/GlowPanel'
import { HoloDivider } from '@/components/HoloDivider'

type EventStreamPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

const events = [
  '00:31 · 边境通讯干扰升高，前线频道短暂失真。',
  '00:47 · 第三观测点传回异常光谱，待进一步核验。',
  '01:03 · 联络窗口开启，匿名通告要求重新议价。',
  '01:18 · 资源航线附近出现未标记舰队投影。',
  '01:29 · 外交辞令被截断，情绪阈值进入警戒区。',
  '01:44 · 盟友请求同步声明，等待行动指令。',
]

export function EventStreamPanel({
  collapsed = false,
  onToggleCollapsed,
  onToggleFullscreen,
}: EventStreamPanelProps) {
  return (
    <GlowPanel className="h-full rounded-none">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 font-hud text-[0.7rem] uppercase tracking-[0.22em]">
          <span className="text-[color:var(--text-primary)]">事件流</span>
          <div className="flex items-center gap-2">
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleCollapsed}
            >
              {collapsed ? '展开' : '折叠'}
            </PixelButton>
            <PixelButton
              tone="ghost"
              className="px-2 py-1 text-[0.56rem] tracking-[0.18em]"
              onClick={onToggleFullscreen}
            >
              全屏
            </PixelButton>
          </div>
        </div>
        <HoloDivider />
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          <div className="grid gap-2">
            {events.map((event, index) => (
              <div
                key={event}
                className="border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2"
              >
                <div className="mb-1 text-[0.54rem] uppercase tracking-[0.22em] text-[color:rgba(196,228,255,0.46)]">
                  记录 {String(index + 1).padStart(2, '0')}
                </div>
                <div className="text-[0.72rem] leading-5 text-[color:var(--text-primary)]">{event}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
