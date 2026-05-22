import { EventStream } from '@/features/eventStream/EventStream'

type EventStreamPanelProps = {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleFullscreen?: () => void
}

export function EventStreamPanel(props: EventStreamPanelProps) {
  return <EventStream {...props} />
}
