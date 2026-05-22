import { PixelButton } from './PixelButton'

type ErrorPanelProps = {
  code?: string
  message: string
  onRetry?: () => void
  onClose?: () => void
}

export function ErrorPanel({ code = 'ACTION_REJECTED', message, onRetry, onClose }: ErrorPanelProps) {
  return (
    <div className="border border-[color:rgba(255,102,102,0.72)] bg-[color:rgba(34,4,8,0.94)] p-3 font-hud text-[color:var(--text-primary)] shadow-[0_0_28px_rgba(255,48,42,0.24)]">
      <div className="text-[0.54rem] uppercase tracking-[0.22em] text-[color:var(--text-hostile)]">
        {code}
      </div>
      <div className="mt-2 text-[0.72rem] leading-5">{message}</div>
      <div className="mt-3 flex justify-end gap-2">
        {onRetry ? (
          <PixelButton tone="danger" className="px-3 py-1 text-[0.54rem]" onClick={onRetry}>
            重试
          </PixelButton>
        ) : null}
        {onClose ? (
          <PixelButton tone="ghost" className="px-3 py-1 text-[0.54rem]" onClick={onClose}>
            关闭
          </PixelButton>
        ) : null}
      </div>
    </div>
  )
}
