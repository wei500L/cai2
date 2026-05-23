import { PixelButton } from '@/components/PixelButton'

type ConnectionErrorPanelProps = {
  wsUrl: string
  errorCode: string
  lastAttemptAt: number
  onRetry: () => void
  onSwitchToMock: () => void
}

function formatAttemptAt(lastAttemptAt: number) {
  if (!lastAttemptAt) {
    return 'n/a'
  }

  return new Date(lastAttemptAt).toLocaleString()
}

export function ConnectionErrorPanel({
  wsUrl,
  errorCode,
  lastAttemptAt,
  onRetry,
  onSwitchToMock,
}: ConnectionErrorPanelProps) {
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[color:rgba(2,4,10,0.82)] px-4">
      <div className="w-[min(34rem,calc(100vw-2rem))] border border-[color:rgba(255,82,96,0.62)] bg-[color:rgba(12,8,12,0.98)] p-5 text-[color:var(--text-primary)] shadow-[0_0_30px_rgba(255,82,96,0.22)]">
        <div className="font-hud text-[0.7rem] uppercase tracking-[0.22em] text-[color:rgba(255,205,210,0.8)]">
          无法连接到后端
        </div>

        <div className="mt-4 space-y-2 font-hud text-[0.6rem] tracking-[0.12em] text-[color:rgba(196,228,255,0.76)]">
          <div>ws url: {wsUrl}</div>
          <div>错误码: {errorCode}</div>
          <div>上次尝试时间: {formatAttemptAt(lastAttemptAt)}</div>
          <div>自动 mock fallback: 已禁用，需手动切换</div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <PixelButton tone="primary" className="px-4 py-2 text-[0.58rem]" onClick={onRetry}>
            重试连接
          </PixelButton>
          <PixelButton tone="ghost" className="px-4 py-2 text-[0.58rem]" onClick={onSwitchToMock}>
            切换到 MOCK 调试模式（仅前端验证）
          </PixelButton>
        </div>
      </div>
    </div>
  )
}
