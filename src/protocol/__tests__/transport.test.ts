import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketTransport } from '../transport'
import type { OutgoingMessage } from '../types'

type SocketHandler<T> = ((event: T) => void) | null

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: SocketHandler<Event> = null
  onmessage: SocketHandler<MessageEvent> = null
  onerror: SocketHandler<Event> = null
  onclose: SocketHandler<CloseEvent> = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({} as Event)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return
    }

    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({} as CloseEvent)
  }

  serverClose() {
    this.close()
  }

  serverMessage(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }
}

function parseSent(socket: FakeWebSocket, index: number) {
  return JSON.parse(socket.sent[index]) as { t: string; p: Record<string, unknown>; seq: number }
}

function roomReadyMessage(id = 'ready_1'): OutgoingMessage {
  return {
    v: 1,
    id,
    t: 'room.ready',
    ts: Date.now(),
    seq: 1,
    p: {
      room_id: 'room_1',
      ready: true,
    },
  }
}

describe('WebSocketTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends conn.auth when the socket opens', () => {
    const statuses: string[] = []
    const transport = new WebSocketTransport(
      'ws://localhost:8000/ws',
      'test-token',
      '1.0.0',
      { enabled: false },
      15000,
      (status) => statuses.push(status),
    )

    transport.connect()
    const socket = FakeWebSocket.instances[0]

    expect(socket.url).toBe('ws://localhost:8000/ws?token=test-token')
    expect(statuses).toEqual(['connecting'])

    socket.open()

    expect(parseSent(socket, 0)).toMatchObject({
      t: 'conn.auth',
      p: {
        token: 'test-token',
        client_version: '1.0.0',
      },
    })
    expect(statuses).toEqual(['connecting', 'open'])
  })

  it('updates lastInboundSeq when a message has seq', () => {
    const transport = new WebSocketTransport('ws://localhost:8000/ws', undefined, '1.0.0')

    transport.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.serverMessage({
      v: 1,
      id: 'pong_1',
      t: 'conn.pong',
      ts: Date.now(),
      seq: 42,
      p: { server_ts: Date.now() },
    })

    expect(transport.getLastInboundSeq()).toBe(42)
  })

  it('queues send while status is connecting', () => {
    const transport = new WebSocketTransport('ws://localhost:8000/ws', undefined, '1.0.0')

    transport.connect()
    const socket = FakeWebSocket.instances[0]
    transport.send(roomReadyMessage())

    expect(transport.getStatus()).toBe('connecting')
    expect(transport.getQueueDepth()).toBe(1)
    expect(socket.sent).toHaveLength(0)
  })

  it('flushes the queue when status becomes open', () => {
    const transport = new WebSocketTransport('ws://localhost:8000/ws', undefined, '1.0.0')

    transport.connect()
    const socket = FakeWebSocket.instances[0]
    transport.send(roomReadyMessage())
    socket.open()

    expect(transport.getQueueDepth()).toBe(0)
    expect(socket.sent.map((_, index) => parseSent(socket, index).t)).toEqual([
      'conn.auth',
      'room.ready',
    ])
  })

  it('reconnects with exponential backoff clamped by maxDelayMs', () => {
    const transport = new WebSocketTransport(
      'ws://localhost:8000/ws',
      undefined,
      '1.0.0',
      { enabled: true, baseDelayMs: 1000, maxDelayMs: 2500, maxAttempts: 4 },
    )

    transport.connect()
    FakeWebSocket.instances[0].open()
    FakeWebSocket.instances[0].serverClose()

    expect(transport.getStatus()).toBe('reconnecting')
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    FakeWebSocket.instances[1].serverClose()
    vi.advanceTimersByTime(1999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    FakeWebSocket.instances[2].serverClose()
    vi.advanceTimersByTime(2499)
    expect(FakeWebSocket.instances).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('closes and reconnects when heartbeat times out', () => {
    const transport = new WebSocketTransport(
      'ws://localhost:8000/ws',
      undefined,
      '1.0.0',
      { enabled: true, baseDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 2 },
      15000,
    )

    transport.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    vi.advanceTimersByTime(15000)
    expect(parseSent(socket, 1).t).toBe('conn.ping')

    vi.advanceTimersByTime(15000)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
    expect(transport.getStatus()).toBe('reconnecting')

    vi.advanceTimersByTime(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('sends reconnect.request with context and last_seq after reconnect', () => {
    const transport = new WebSocketTransport(
      'ws://localhost:8000/ws',
      undefined,
      '1.0.0',
      { enabled: true, baseDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 2 },
    )

    transport.connect()
    const firstSocket = FakeWebSocket.instances[0]
    firstSocket.open()
    firstSocket.serverMessage({
      v: 1,
      id: 'phase_1',
      t: 'phase.change',
      ts: Date.now(),
      seq: 9,
      p: {},
    })
    transport.setReconnectContext({
      roomId: 'room_1',
      playerId: 'player_1',
      sessionToken: 'session_1',
    })

    firstSocket.serverClose()
    vi.advanceTimersByTime(1000)
    const reconnectSocket = FakeWebSocket.instances[1]
    reconnectSocket.open()

    expect(parseSent(reconnectSocket, 0)).toMatchObject({
      t: 'reconnect.request',
      p: {
        room_id: 'room_1',
        player_id: 'player_1',
        last_seq: 9,
        session_token: 'session_1',
      },
    })
  })
})
