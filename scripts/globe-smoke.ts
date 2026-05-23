import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { chromium, type Browser, type Page } from 'playwright'

type MapQuality = 'low' | 'mid' | 'high'
type GlobeRenderer = '2d' | 'r3f' | 'globe'
type SmokeMetrics = {
  fps: number
  quality: MapQuality
  renderer: GlobeRenderer
  roomMode: string
  roomPlayers: number
  aiFactions: number
  turn: number
  scorchedCount: number
  activeExplosionHandles: number
  activeSmokeColumns: number
  heapUsed: number | null
}

declare global {
  interface Window {
    __DIPLOMACY_SMOKE__: {
      metrics: () => SmokeMetrics
    } & Record<string, (...args: unknown[]) => unknown>
    gc?: () => void
  }
}

type AssertionRecord = {
  name: string
  pass: boolean
  detail: string
}

const FPS_FLOORS: Record<MapQuality, number> = {
  low: 58,
  mid: 55,
  high: 45,
}

const reportRows: string[] = []
const assertions: AssertionRecord[] = []
const consoleErrors: string[] = []

function assertSmoke(condition: boolean, name: string, detail: string) {
  assertions.push({ name, pass: condition, detail })
  if (!condition) {
    throw new Error(`${name}: ${detail}`)
  }
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForHttp(url: string, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function startDevServer(port: number) {
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LLM_PROVIDER: 'mock',
      VITE_USE_WS: 'false',
    },
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  await waitForHttp(`http://127.0.0.1:${port}/game`)
  return {
    child,
    stop: () => stopProcess(child, stderr),
  }
}

async function stopProcess(child: ChildProcessWithoutNullStreams, stderr: string) {
  if (child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })

  if (stderr.trim()) {
    reportRows.push(`<p><strong>dev stderr</strong>: <code>${escapeHtml(stderr.trim()).slice(0, 2000)}</code></p>`)
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function smokeEval<T>(page: Page, body: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([source, values]) => {
      const fn = new Function('args', `return (${source})(...args)`)
      return fn(values)
    },
    [body, args] as const,
  ) as Promise<T>
}

async function metrics(page: Page) {
  return smokeEval<SmokeMetrics>(page, '() => window.__DIPLOMACY_SMOKE__.metrics()')
}

async function callHarness(page: Page, method: string, ...args: unknown[]) {
  await smokeEval<void>(
    page,
    `(method, values) => window.__DIPLOMACY_SMOKE__[method](...values)`,
    method,
    args,
  )
}

async function settleFrames(page: Page, ms: number) {
  await page.waitForTimeout(ms)
}

async function assertFpsFloor(page: Page, quality: MapQuality, durationMs: number) {
  await callHarness(page, 'setQuality', quality)
  await page.waitForFunction((expected) => window.__DIPLOMACY_SMOKE__.metrics().quality === expected, quality)
  await settleFrames(page, 1_000)

  const samples: number[] = []
  const startedAt = Date.now()
  while (Date.now() - startedAt < durationMs) {
    samples.push((await metrics(page)).fps)
    await settleFrames(page, 250)
  }

  const min = Math.min(...samples)
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length
  reportRows.push(
    `<tr><td>${quality}</td><td>${avg.toFixed(1)}</td><td>${min.toFixed(1)}</td><td>${FPS_FLOORS[quality]}</td></tr>`,
  )
  assertSmoke(
    min >= FPS_FLOORS[quality],
    `fps floor ${quality}`,
    `min ${min.toFixed(1)} fps, required ${FPS_FLOORS[quality]}`,
  )
}

async function assertNoConsoleErrors(label: string) {
  assertSmoke(consoleErrors.length === 0, `console errors ${label}`, consoleErrors.join('\n') || 'none')
}

async function runQualitySwitchSmoke(page: Page) {
  const startedAt = Date.now()
  const order: MapQuality[] = ['low', 'mid', 'high']
  let index = 0

  while (Date.now() - startedAt < 30_000) {
    const quality = order[index % order.length]
    await callHarness(page, 'setQuality', quality)
    await page.waitForFunction((expected) => window.__DIPLOMACY_SMOKE__.metrics().quality === expected, quality)
    const snapshot = await metrics(page)
    assertSmoke(snapshot.quality === quality, `quality applied ${quality}`, `actual ${snapshot.quality}`)
    await settleFrames(page, 950)
    index += 1
  }

  await assertNoConsoleErrors('quality switch')
}

async function runRendererRoundTrips(page: Page) {
  await callHarness(page, 'setRenderer', 'globe')
  await settleFrames(page, 1_000)
  await smokeEval<void>(page, '() => window.gc?.()')
  const before = await metrics(page)
  const sequence: GlobeRenderer[] = ['2d', 'r3f', 'globe']

  for (let round = 0; round < 3; round += 1) {
    for (const renderer of sequence) {
      await callHarness(page, 'setRenderer', renderer)
      await page.waitForFunction((expected) => window.__DIPLOMACY_SMOKE__.metrics().renderer === expected, renderer)
      await settleFrames(page, 1_000)
      const snapshot = await metrics(page)
      assertSmoke(snapshot.renderer === renderer, `renderer applied ${round + 1}:${renderer}`, `actual ${snapshot.renderer}`)
    }
  }

  await smokeEval<void>(page, '() => window.gc?.()')
  const after = await metrics(page)
  const canvasCount = await smokeEval<number>(page, "() => document.querySelectorAll('canvas').length")
  assertSmoke(canvasCount <= 3, 'renderer canvas count', `${canvasCount} canvas nodes after round trips`)

  if (before.heapUsed !== null && after.heapUsed !== null) {
    const allowed = before.heapUsed * 1.35 + 20 * 1024 * 1024
    assertSmoke(
      after.heapUsed <= allowed,
      'renderer heap growth',
      `before ${before.heapUsed}, after ${after.heapUsed}, allowed ${Math.round(allowed)}`,
    )
  } else {
    assertSmoke(after.activeExplosionHandles === 0, 'renderer active handles fallback', `${after.activeExplosionHandles} active handles`)
  }

  await assertNoConsoleErrors('renderer round trips')
}

async function runScenario(page: Page) {
  await page.goto('/game', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__DIPLOMACY_SMOKE__))
  await callHarness(page, 'reset')
  await callHarness(page, 'create4v4Room')
  await page.waitForFunction(() => window.__DIPLOMACY_SMOKE__.metrics().roomMode === 'multi_4v4')

  const room = await metrics(page)
  assertSmoke(room.roomPlayers === 4, '4 human room players', `${room.roomPlayers}`)
  assertSmoke(room.aiFactions === 4, '4 ai factions', `${room.aiFactions}`)

  const scorchedHex = await smokeEval<string | null>(page, "() => window.__DIPLOMACY_SMOKE__.seedExpiredScorched()")
  assertSmoke(typeof scorchedHex === 'string' && scorchedHex.length > 0, 'seed scorched ttl', String(scorchedHex))

  await callHarness(page, 'advanceTurns', 5)
  const afterTurns = await metrics(page)
  assertSmoke(afterTurns.turn >= 6, 'advance five turns', `turn ${afterTurns.turn}`)
  assertSmoke(afterTurns.scorchedCount === 0, 'expired scorched cleared', `${afterTurns.scorchedCount} scorched entries`)

  await callHarness(page, 'triggerExplosion', 'nuke')
  await callHarness(page, 'triggerExplosion', 'conventional')
  await callHarness(page, 'triggerExplosion', 'conventional')
  await callHarness(page, 'addSpeech', 5)
  await settleFrames(page, 250)
  const afterFx = await metrics(page)
  assertSmoke(afterFx.activeExplosionHandles > 0, 'explosions spawned', `${afterFx.activeExplosionHandles} handles`)
  await settleFrames(page, 4_300)
  const afterTtl = await metrics(page)
  assertSmoke(afterTtl.activeExplosionHandles === 0, 'explosions disposed after ttl', `${afterTtl.activeExplosionHandles} handles`)

  await assertFpsFloor(page, 'low', 2_500)
  await assertFpsFloor(page, 'mid', 2_500)
  await assertFpsFloor(page, 'high', 2_500)
  await runQualitySwitchSmoke(page)
  await runRendererRoundTrips(page)
}

async function writeReport(status: 'passed' | 'failed', error?: unknown) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportDir = path.join(process.cwd(), 'reports')
  await mkdir(reportDir, { recursive: true })
  const filename = path.join(reportDir, `globe-smoke-${timestamp}.html`)
  const assertionRows = assertions
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.pass ? 'PASS' : 'FAIL'}</td><td>${escapeHtml(item.detail)}</td></tr>`,
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Globe Smoke ${status}</title>
    <style>
      body { background: #050912; color: #d9ecff; font: 14px system-ui, sans-serif; padding: 24px; }
      table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      th, td { border: 1px solid rgba(196,228,255,.22); padding: 8px; text-align: left; }
      th { background: rgba(51,170,255,.12); }
      code { color: #ffcf66; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Globe Smoke ${status.toUpperCase()}</h1>
    <p>Assertions: ${assertions.length}</p>
    ${error ? `<h2>Error</h2><code>${escapeHtml(String(error instanceof Error ? error.stack ?? error.message : error))}</code>` : ''}
    <h2>FPS Samples</h2>
    <table><thead><tr><th>Quality</th><th>Avg FPS</th><th>Min FPS</th><th>Floor</th></tr></thead><tbody>${reportRows.filter((row) => row.startsWith('<tr>')).join('\n')}</tbody></table>
    <h2>Assertions</h2>
    <table><thead><tr><th>Name</th><th>Status</th><th>Detail</th></tr></thead><tbody>${assertionRows}</tbody></table>
    ${reportRows.filter((row) => !row.startsWith('<tr>')).join('\n')}
  </body>
</html>`
  await writeFile(filename, html)
  return filename
}

async function main() {
  let devServer: Awaited<ReturnType<typeof startDevServer>> | null = null
  let browser: Browser | null = null

  try {
    const port = await findFreePort()
    devServer = await startDevServer(port)
    browser = await chromium.launch({
      headless: true,
      args: ['--js-flags=--expose-gc', '--disable-background-timer-throttling'],
    })
    const page = await browser.newPage({ baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1920, height: 1080 } })
    page.on('pageerror', (error) => consoleErrors.push(error.stack ?? error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await runScenario(page)
    await assertNoConsoleErrors('final')
    const report = await writeReport('passed')
    console.log(`globe smoke passed: ${assertions.length} assertions`)
    console.log(report)
  } catch (error) {
    const report = await writeReport('failed', error)
    console.error(`globe smoke failed after ${assertions.length} assertions`)
    console.error(report)
    throw error
  } finally {
    await browser?.close()
    await devServer?.stop()
  }
}

main().catch(() => {
  process.exit(1)
})
