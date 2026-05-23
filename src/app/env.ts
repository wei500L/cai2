export const ENV = {
  useWs: import.meta.env.VITE_USE_WS === 'true',
  allowMockFallback: import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws',
  wsToken: import.meta.env.VITE_WS_TOKEN ?? '',
  backendRestBase: import.meta.env.VITE_BACKEND_REST_BASE ?? 'http://localhost:8000/debug/v1',
  heartbeatMs: Number(import.meta.env.VITE_HEARTBEAT_MS ?? 15000),
  clientVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev',
} as const
