import type { OutgoingMessage } from './types'

export type MockTransport = {
  send: (message: OutgoingMessage) => Promise<void>
  close: () => void
}

export const createMockTransport = (): MockTransport => ({
  send: async () => undefined,
  close: () => undefined,
})
