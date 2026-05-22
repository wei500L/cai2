import { PixelButton } from '@/components/PixelButton'

type SendButtonProps = {
  disabled: boolean
  aggressive: boolean
  statusText: string
  onClick: () => void
}

export function SendButton({ disabled, aggressive, statusText, onClick }: SendButtonProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 truncate font-hud text-[0.56rem] uppercase tracking-[0.16em] text-[color:rgba(196,228,255,0.52)]">
        {statusText}
      </div>
      <PixelButton
        tone={aggressive ? 'danger' : 'primary'}
        disabled={disabled}
        className="h-9 px-4 text-[0.58rem] tracking-[0.2em]"
        onClick={onClick}
      >
        发送
      </PixelButton>
    </div>
  )
}
