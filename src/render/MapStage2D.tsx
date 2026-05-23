import { useEffect, useRef, useState } from 'react'
import { factionIds, factionTokens } from '@/components/hudTheme'
import { factionMetaStore } from '@/store/factionMetaStore'
import type { FactionId } from '@/types/faction'
import type { MapRegion, Relationship } from '@/types'
import { gameStoreApi } from '@/store/gameStore'
import { useUIStore, type MapQuality } from '@/store/uiStore'
import { getParticleDensityMultiplier } from '@/utils/particleDensity'
import type { RegionAnimationParams } from '@/protocol/types'

type Rgb = { r: number; g: number; b: number }
type PaletteEntry = {
  primary: string
  glow: string
  shadow: string
  primaryRgb: Rgb
  glowRgb: Rgb
}
type Palette = Record<FactionId, PaletteEntry>
type RegionCell = {
  region: MapRegion
  row: number
  col: number
}
type MapLayout = {
  cells: RegionCell[]
  byId: Map<string, RegionCell>
  grid: Array<Array<RegionCell | null>>
}
type ViewState = {
  scale: number
  panX: number
  panY: number
  userScale: number
  userPanX: number
  userPanY: number
}
type HoverState = {
  id: string
  owner: string
  development: number
  terrain: string
}
type ParticleSeed = {
  a: number
  b: number
  c: number
  d: number
}
type OwnershipFlow = {
  regionId: string
  previousOwner: FactionId | null
  newOwner: FactionId | null
  animationParams: RegionAnimationParams
  startedAt: number
}

const GRID_SIZE = 8
const FULL_ARC = Math.PI * 2
const START_ANGLE = -Math.PI / 2
const MAX_PARTICLES = 8_000
const OWNERSHIP_FLOW_DURATION = 1.2
const DEFAULT_FLOW_PARAMS: RegionAnimationParams = {
  direction: 'west_to_east',
  speed: 1,
  particles: 'neutral',
}
let lastParticleStatAt = 0
const PARTICLE_POOL: ParticleSeed[] = Array.from({ length: MAX_PARTICLES }, (_, index) => ({
  a: hash01(`pool:${index}:a`),
  b: hash01(`pool:${index}:b`),
  c: hash01(`pool:${index}:c`),
  d: hash01(`pool:${index}:d`),
}))

const qualityConfig: Record<
  MapQuality,
  { particleLimit: number; noisePerRegion: number; routeParticles: number; bloom: number; energy: number }
> = {
  low: { particleLimit: 2_000, noisePerRegion: 6, routeParticles: 6, bloom: 0.7, energy: 0.55 },
  mid: { particleLimit: 4_000, noisePerRegion: 12, routeParticles: 10, bloom: 1, energy: 0.8 },
  high: { particleLimit: 8_000, noisePerRegion: 22, routeParticles: 16, bloom: 1.35, energy: 1 },
}

function hash01(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return ((hash >>> 0) % 10000) / 10000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(current: number, target: number, speed: number) {
  return current + (target - current) * speed
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function parseCssColor(value: string, fallback: Rgb): Rgb {
  const color = value.trim()

  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      }
    }

    if (hex.length >= 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      }
    }
  }

  const rgbMatch = color.match(/rgba?\(([^)]+)\)/)
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()))
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return { r, g, b }
    }
  }

  return fallback
}

function toRgba(color: Rgb, alpha: number) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
}

function mixRgb(a: Rgb, b: Rgb, amount = 0.5): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  }
}

function resolveColorToken(token: string, styles: CSSStyleDeclaration) {
  const match = token.match(/^var\((--[^)]+)\)$/)
  return match ? styles.getPropertyValue(match[1]).trim() : token
}

function buildPalette(): Palette {
  const styles = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    factionIds.map((id) => {
      const meta = factionMetaStore.getState().byId[id]
      const token = meta ?? factionTokens[id]
      const primary = resolveColorToken(token.primary, styles)
      const glow = resolveColorToken(token.glow, styles)
      const shadow = resolveColorToken(token.shadow, styles)

      return [
        id,
        {
          primary,
          glow,
          shadow,
          primaryRgb: parseCssColor(primary, { r: 51, g: 170, b: 255 }),
          glowRgb: parseCssColor(glow, { r: 51, g: 170, b: 255 }),
        },
      ]
    }),
  ) as Palette
}

function buildLayout(regions: MapRegion[]): MapLayout {
  const grid: Array<Array<RegionCell | null>> = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  )
  const byId = new Map<string, RegionCell>()
  const sortedRows = [...regions].sort((a, b) => a.centerLatLng[0] - b.centerLatLng[0])

  for (let row = 0; row < GRID_SIZE; row += 1) {
    const rowRegions = sortedRows
      .slice(row * GRID_SIZE, row * GRID_SIZE + GRID_SIZE)
      .sort((a, b) => a.centerLatLng[1] - b.centerLatLng[1])

    for (let col = 0; col < GRID_SIZE; col += 1) {
      const region = rowRegions[col]
      if (!region) {
        continue
      }

      const cell = { region, row, col }
      grid[row][col] = cell
      byId.set(region.id, cell)
    }
  }

  return {
    cells: grid.flat().filter((cell): cell is RegionCell => Boolean(cell)),
    byId,
    grid,
  }
}

function getCellAngles(col: number) {
  const sector = FULL_ARC / GRID_SIZE
  const start = START_ANGLE + col * sector
  return { start, end: start + sector }
}

function getCellCenter(cell: RegionCell, radius: number) {
  const { start, end } = getCellAngles(cell.col)
  const ringInner = (cell.row / GRID_SIZE) * radius
  const ringOuter = ((cell.row + 1) / GRID_SIZE) * radius
  const r = (ringInner + ringOuter) * 0.5
  const angle = (start + end) * 0.5
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

function traceCellPath(ctx: CanvasRenderingContext2D, cell: RegionCell, radius: number) {
  const { start, end } = getCellAngles(cell.col)
  const inner = (cell.row / GRID_SIZE) * radius
  const outer = ((cell.row + 1) / GRID_SIZE) * radius

  ctx.beginPath()
  ctx.arc(0, 0, outer, start, end)
  if (inner <= 0.001) {
    ctx.lineTo(0, 0)
  } else {
    ctx.arc(0, 0, inner, end, start, true)
  }
  ctx.closePath()
}

function drawPixelCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const size = Math.max(1, radius)
  ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size)
}

function getRegionAtPoint(layout: MapLayout, x: number, y: number, radius: number) {
  const distance = Math.hypot(x, y)
  if (distance > radius) {
    return null
  }

  const row = clamp(Math.floor((distance / radius) * GRID_SIZE), 0, GRID_SIZE - 1)
  const angle = mod(Math.atan2(y, x) - START_ANGLE, FULL_ARC)
  const col = clamp(Math.floor(angle / (FULL_ARC / GRID_SIZE)), 0, GRID_SIZE - 1)
  return layout.grid[row]?.[col] ?? null
}

function getRelation(relationships: Relationship[], a?: FactionId | null, b?: FactionId | null) {
  if (!a || !b || a === b) {
    return null
  }

  return relationships.find(
    (relationship) =>
      (relationship.from === a && relationship.to === b) ||
      (relationship.from === b && relationship.to === a),
  )
}

function drawBackgroundParticles(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number,
  quality: MapQuality,
) {
  const config = qualityConfig[quality]
  const density = getParticleDensityMultiplier(useUIStore.getState().globalParticleDensity)
  const count = Math.min(MAX_PARTICLES, Math.floor(config.particleLimit * 0.22 * density))
  ctx.fillStyle = `rgba(100, 198, 255, ${0.13 * config.energy})`

  for (let index = 0; index < count; index += 1) {
    const particle = PARTICLE_POOL[index]
    const angle = particle.a * FULL_ARC + time * (0.018 + particle.d * 0.02)
    const r = Math.sqrt(particle.b) * radius * 0.96
    const pulse = 0.55 + Math.sin(time * 2 + particle.c * 12) * 0.45
    ctx.globalAlpha = (0.12 + pulse * 0.22) * config.energy
    ctx.fillRect(Math.cos(angle) * r, Math.sin(angle) * r, 1.2, 1.2)
  }

  ctx.globalAlpha = 1
}

function drawBoardBase(ctx: CanvasRenderingContext2D, radius: number, quality: MapQuality) {
  const bloom = qualityConfig[quality].bloom
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius)
  gradient.addColorStop(0, 'rgba(10, 23, 34, 0.96)')
  gradient.addColorStop(0.62, 'rgba(4, 10, 18, 0.98)')
  gradient.addColorStop(1, 'rgba(0, 1, 5, 1)')

  ctx.save()
  ctx.shadowColor = 'rgba(51, 170, 255, 0.32)'
  ctx.shadowBlur = 26 * bloom
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, FULL_ARC)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(196, 228, 255, 0.12)'
  ctx.lineWidth = 1
  for (let ring = 1; ring < GRID_SIZE; ring += 1) {
    ctx.beginPath()
    ctx.arc(0, 0, (ring / GRID_SIZE) * radius, 0, FULL_ARC)
    ctx.stroke()
  }
}

function drawRegions(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  radius: number,
  palette: Palette,
  time: number,
  quality: MapQuality,
  ownershipFlows: Map<string, OwnershipFlow>,
) {
  const config = qualityConfig[quality]
  const density = getParticleDensityMultiplier(useUIStore.getState().globalParticleDensity)

  for (const cell of layout.cells) {
    const owner = cell.region.owner
    const flow = ownershipFlows.get(cell.region.id)
    const token = owner ? palette[owner] : null
    const previousToken = flow?.previousOwner ? palette[flow.previousOwner] : null
    const base = flow && previousToken ? previousToken.primaryRgb : token?.primaryRgb ?? { r: 60, g: 72, b: 84 }
    const targetBase = token?.primaryRgb ?? { r: 60, g: 72, b: 84 }
    const glow = token?.glowRgb ?? { r: 120, g: 142, b: 166 }
    const breath = 0.5 + Math.sin(time * 1.45 + cell.row * 0.6 + cell.col * 0.41) * 0.5
    const resourceBoost = cell.region.resourceValue / 100
    const flowProgress = flow ? clamp((time - flow.startedAt) / OWNERSHIP_FLOW_DURATION, 0, 1) : 1

    traceCellPath(ctx, cell, radius)
    ctx.fillStyle = toRgba(flow ? mixRgb(base, targetBase, flowProgress * 0.35) : base, 0.44 + resourceBoost * 0.18)
    ctx.fill()

    if (flow) {
      const center = getCellCenter(cell, radius)
      const spread = radius * (0.035 + flowProgress * 0.22)
      const flowGradient = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, spread)
      flowGradient.addColorStop(0, toRgba(glow, 0.42 * (1 - flowProgress * 0.18)))
      flowGradient.addColorStop(0.56, toRgba(targetBase, 0.34))
      flowGradient.addColorStop(1, toRgba(targetBase, 0))
      traceCellPath(ctx, cell, radius)
      ctx.fillStyle = flowGradient
      ctx.fill()

      ctx.save()
      traceCellPath(ctx, cell, radius)
      ctx.clip()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = toRgba(glow, (1 - flowProgress) * 0.55)
      ctx.lineWidth = 2
      const horizontal = flow.animationParams.direction === 'west_to_east' || flow.animationParams.direction === 'east_to_west'
      const sign =
        flow.animationParams.direction === 'west_to_east' || flow.animationParams.direction === 'south_to_north'
          ? 1
          : -1
      for (let line = 0; line < 4; line += 1) {
        const offset =
          (((flowProgress * flow.animationParams.speed) * sign) * radius * 0.34 +
            line * radius * 0.045) %
          (radius * 0.18)
        ctx.beginPath()
        if (horizontal) {
          ctx.moveTo(center.x - radius * 0.18 + offset, center.y - radius * 0.16)
          ctx.lineTo(center.x + radius * 0.18 + offset, center.y + radius * 0.16)
        } else {
          ctx.moveTo(center.x - radius * 0.16, center.y - radius * 0.18 + offset)
          ctx.lineTo(center.x + radius * 0.16, center.y + radius * 0.18 + offset)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    const center = getCellCenter(cell, radius)
    const glowGradient = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, radius * 0.16)
    glowGradient.addColorStop(0, toRgba(glow, (0.13 + breath * 0.12) * config.bloom))
    glowGradient.addColorStop(1, toRgba(glow, 0))
    traceCellPath(ctx, cell, radius)
    ctx.fillStyle = glowGradient
    ctx.fill()

    ctx.fillStyle = toRgba(mixRgb(base, glow, 0.55), 0.16 * config.energy)
    const noiseCount = Math.max(1, Math.floor(config.noisePerRegion * density))
    for (let index = 0; index < noiseCount; index += 1) {
      const seed = `${cell.region.id}:noise:${index}`
      const angle = START_ANGLE + (cell.col + hash01(`${seed}:a`)) * (FULL_ARC / GRID_SIZE)
      const inner = cell.row / GRID_SIZE
      const outer = (cell.row + 1) / GRID_SIZE
      const r = radius * (inner + (outer - inner) * (0.16 + hash01(`${seed}:r`) * 0.78))
      ctx.fillRect(Math.cos(angle) * r, Math.sin(angle) * r, 1.5, 1.5)
    }
  }
}

function drawBorders(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  radius: number,
  relationships: Relationship[],
  palette: Palette,
  time: number,
  quality: MapQuality,
) {
  const pulse = 0.52 + Math.sin(time * 3.2) * 0.48
  const bloom = qualityConfig[quality].bloom

  for (const cell of layout.cells) {
    const right = layout.grid[cell.row]?.[(cell.col + 1) % GRID_SIZE]
    if (right && right.region.owner !== cell.region.owner) {
      const mixed = mixRgb(
        cell.region.owner ? palette[cell.region.owner].glowRgb : { r: 120, g: 130, b: 145 },
        right.region.owner ? palette[right.region.owner].glowRgb : { r: 120, g: 130, b: 145 },
      )
      const angle = START_ANGLE + (cell.col + 1) * (FULL_ARC / GRID_SIZE)
      const inner = (cell.row / GRID_SIZE) * radius
      const outer = ((cell.row + 1) / GRID_SIZE) * radius
      ctx.save()
      ctx.strokeStyle = toRgba(mixed, 0.34 + pulse * 0.38)
      ctx.lineWidth = 1 + pulse * 1
      ctx.shadowColor = toRgba(mixed, 0.7)
      ctx.shadowBlur = 8 * bloom
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
      ctx.stroke()
      ctx.restore()

      if (getRelation(relationships, cell.region.owner, right.region.owner)?.status === 'hostile') {
        drawSparkLine(ctx, angle, inner, outer, time, bloom)
      }
    }

    const outerNeighbor = layout.grid[cell.row + 1]?.[cell.col]
    if (outerNeighbor && outerNeighbor.region.owner !== cell.region.owner) {
      const mixed = mixRgb(
        cell.region.owner ? palette[cell.region.owner].glowRgb : { r: 120, g: 130, b: 145 },
        outerNeighbor.region.owner ? palette[outerNeighbor.region.owner].glowRgb : { r: 120, g: 130, b: 145 },
      )
      const { start, end } = getCellAngles(cell.col)
      const borderRadius = ((cell.row + 1) / GRID_SIZE) * radius
      ctx.save()
      ctx.strokeStyle = toRgba(mixed, 0.34 + pulse * 0.38)
      ctx.lineWidth = 1 + pulse * 1
      ctx.shadowColor = toRgba(mixed, 0.7)
      ctx.shadowBlur = 8 * bloom
      ctx.beginPath()
      ctx.arc(0, 0, borderRadius, start, end)
      ctx.stroke()
      ctx.restore()

      if (getRelation(relationships, cell.region.owner, outerNeighbor.region.owner)?.status === 'hostile') {
        drawSparkArc(ctx, borderRadius, start, end, time, bloom)
      }
    }
  }
}

function drawSparkLine(
  ctx: CanvasRenderingContext2D,
  angle: number,
  inner: number,
  outer: number,
  time: number,
  bloom: number,
) {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 72, 64, 0.95)'
  ctx.shadowColor = 'rgba(255, 48, 42, 0.86)'
  ctx.shadowBlur = 10 * bloom
  for (let index = 0; index < 4; index += 1) {
    const amount = mod(time * (0.8 + index * 0.17) + index * 0.27, 1)
    const r = inner + (outer - inner) * amount
    drawPixelCircle(ctx, Math.cos(angle) * r, Math.sin(angle) * r, 2 + index * 0.35)
  }
  ctx.restore()
}

function drawSparkArc(
  ctx: CanvasRenderingContext2D,
  radius: number,
  start: number,
  end: number,
  time: number,
  bloom: number,
) {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 72, 64, 0.95)'
  ctx.shadowColor = 'rgba(255, 48, 42, 0.86)'
  ctx.shadowBlur = 10 * bloom
  for (let index = 0; index < 4; index += 1) {
    const amount = mod(time * (0.72 + index * 0.19) + index * 0.31, 1)
    const angle = start + (end - start) * amount
    drawPixelCircle(ctx, Math.cos(angle) * radius, Math.sin(angle) * radius, 2 + index * 0.35)
  }
  ctx.restore()
}

function drawCities(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  radius: number,
  palette: Palette,
  quality: MapQuality,
) {
  const bloom = qualityConfig[quality].bloom
  for (const cell of layout.cells) {
    const glow = cell.region.owner ? palette[cell.region.owner].glowRgb : { r: 196, g: 228, b: 255 }
    const cityCount = clamp(cell.region.developmentLevel, 1, 5)
    for (let index = 0; index < cityCount; index += 1) {
      const seed = `${cell.region.id}:city:${index}`
      const angle = START_ANGLE + (cell.col + 0.18 + hash01(`${seed}:a`) * 0.64) * (FULL_ARC / GRID_SIZE)
      const inner = cell.row / GRID_SIZE
      const outer = (cell.row + 1) / GRID_SIZE
      const r = radius * (inner + (outer - inner) * (0.24 + hash01(`${seed}:r`) * 0.58))
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      ctx.save()
      ctx.fillStyle = 'rgba(245, 252, 255, 0.96)'
      ctx.shadowColor = toRgba(glow, 0.88)
      ctx.shadowBlur = 8 * bloom
      drawPixelCircle(ctx, x, y, 2.2 + cityCount * 0.22)
      ctx.restore()
    }
  }
}

function drawFocus(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  radius: number,
  palette: Palette,
  time: number,
) {
  const focus = useUIStore.getState().mapFocus
  if (!focus) {
    return
  }

  const focusCells = new Set<RegionCell>()
  if (focus.regionId) {
    const cell = layout.byId.get(focus.regionId)
    if (cell) {
      focusCells.add(cell)
      const owner = cell.region.owner
      const neighbors = [
        layout.grid[cell.row]?.[mod(cell.col - 1, GRID_SIZE)],
        layout.grid[cell.row]?.[(cell.col + 1) % GRID_SIZE],
        layout.grid[cell.row - 1]?.[cell.col],
        layout.grid[cell.row + 1]?.[cell.col],
      ]
      for (const neighbor of neighbors) {
        if (neighbor?.region.owner === owner) {
          focusCells.add(neighbor)
        }
      }
    }
  }

  if (focus.factionId) {
    for (const cell of layout.cells) {
      if (cell.region.owner === focus.factionId) {
        focusCells.add(cell)
      }
    }
  }

  const pulse = 0.5 + Math.sin(time * 4.4) * 0.5
  for (const cell of focusCells) {
    const glow = cell.region.owner ? palette[cell.region.owner].glowRgb : { r: 255, g: 255, b: 255 }
    ctx.save()
    traceCellPath(ctx, cell, radius)
    ctx.fillStyle = toRgba(glow, 0.12 + pulse * 0.1)
    ctx.fill()
    ctx.strokeStyle = toRgba(glow, 0.78)
    ctx.lineWidth = 2.2 + pulse * 1.1
    ctx.shadowColor = toRgba(glow, 0.9)
    ctx.shadowBlur = 18
    ctx.stroke()
    ctx.restore()
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: ViewState,
  layout: MapLayout,
  palette: Palette,
  time: number,
  ownershipFlows: Map<string, OwnershipFlow>,
  qualityOverride?: MapQuality,
) {
  const state = gameStoreApi.getState()
  const quality = qualityOverride ?? useUIStore.getState().mapQuality
  const density = getParticleDensityMultiplier(useUIStore.getState().globalParticleDensity)
  const particleCount = Math.min(
    MAX_PARTICLES,
    Math.floor(qualityConfig[quality].particleLimit * 0.22 * density) +
      layout.cells.length * Math.max(1, Math.floor(qualityConfig[quality].noisePerRegion * density)),
  )
  const radius = Math.min(width, height) * 0.42

  if (time - lastParticleStatAt > 0.5) {
    lastParticleStatAt = time
    useUIStore.getState().setPerfStats({ particleCount })
  }

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(1, 3, 8, 1)'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(width * 0.5 + view.panX, height * 0.5 + view.panY)
  ctx.scale(view.scale, view.scale)

  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, FULL_ARC)
  ctx.clip()
  drawBoardBase(ctx, radius, quality)
  drawRegions(ctx, layout, radius, palette, time, quality, ownershipFlows)
  drawBackgroundParticles(ctx, radius, time, quality)
  drawBorders(ctx, layout, radius, state.relationships, palette, time, quality)
  drawCities(ctx, layout, radius, palette, quality)
  drawFocus(ctx, layout, radius, palette, time)
  ctx.restore()

  ctx.strokeStyle = 'rgba(196, 228, 255, 0.18)'
  ctx.lineWidth = 1.2
  ctx.shadowColor = 'rgba(51, 170, 255, 0.4)'
  ctx.shadowBlur = 18 * qualityConfig[quality].bloom
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, FULL_ARC)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(196, 228, 255, 0.18)'
  ctx.font = '10px "Share Tech Mono", monospace'
  ctx.fillText(`QUALITY:${quality.toUpperCase()} PARTICLES~${particleCount}`, 14, height - 16)
  ctx.restore()
}

function applyFocusTarget(view: ViewState, layout: MapLayout, radius: number) {
  const focus = useUIStore.getState().mapFocus
  let targetScale = view.userScale
  let targetPanX = view.userPanX
  let targetPanY = view.userPanY

  if (focus) {
    const focusCell =
      focus.regionId && layout.byId.get(focus.regionId)
        ? layout.byId.get(focus.regionId)
        : layout.cells.find((cell) => cell.region.owner === focus.factionId)

    if (focusCell) {
      const center = getCellCenter(focusCell, radius)
      targetScale = clamp(Math.max(view.userScale, 1.16), 0.85, 1.25)
      targetPanX = view.userPanX - center.x * targetScale * 0.64
      targetPanY = view.userPanY - center.y * targetScale * 0.64
    }
  }

  view.scale = lerp(view.scale, targetScale, 0.07)
  view.panX = lerp(view.panX, targetPanX, 0.07)
  view.panY = lerp(view.panY, targetPanY, 0.07)
}

type MapStage2DProps = {
  qualityOverride?: MapQuality
  interactive?: boolean
}

export function MapStage2D({ qualityOverride, interactive = true }: MapStage2DProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const paletteRef = useRef<Palette | null>(null)
  const layoutRef = useRef<{ source: MapRegion[] | null; layout: MapLayout | null }>({
    source: null,
    layout: null,
  })
  const ownerSnapshotRef = useRef<Map<string, FactionId | null>>(new Map())
  const ownershipFlowsRef = useRef<Map<string, OwnershipFlow>>(new Map())
  const appliedTransitionIdsRef = useRef<Set<string>>(new Set())
  const viewRef = useRef<ViewState>({
    scale: 1,
    panX: 0,
    panY: 0,
    userScale: 1,
    userPanX: 0,
    userPanY: 0,
  })
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const hoverIdRef = useRef<string | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const factionMetaLoadedAt = factionMetaStore((state) => state.loadedAt)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      return undefined
    }

    paletteRef.current = buildPalette()
    let width = 0
    let height = 0
    let frame = 0
    let mounted = true
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
    }

    const getLayout = (): MapLayout => {
      const regions = gameStoreApi.getState().regions
      if (layoutRef.current.source !== regions || !layoutRef.current.layout) {
        layoutRef.current = { source: regions, layout: buildLayout(regions) }
      }

      return layoutRef.current.layout as MapLayout
    }

    const syncOwnershipFlows = (nowSeconds: number) => {
      const state = gameStoreApi.getState()
      const regions = state.regions
      const snapshot = ownerSnapshotRef.current

      if (snapshot.size === 0) {
        for (const region of regions) {
          snapshot.set(region.id, region.owner)
        }
      }

      for (const transition of state.regionTransitionLog) {
        if (appliedTransitionIdsRef.current.has(transition.id)) {
          continue
        }
        appliedTransitionIdsRef.current.add(transition.id)
        ownershipFlowsRef.current.set(transition.region_id, {
          regionId: transition.region_id,
          previousOwner: transition.prev_owner,
          newOwner: transition.new_owner,
          animationParams: transition.animation_params,
          startedAt: nowSeconds,
        })
        snapshot.set(transition.region_id, transition.new_owner)
      }

      for (const region of regions) {
        const previousOwner = snapshot.get(region.id)
        if (previousOwner !== region.owner) {
          ownershipFlowsRef.current.set(region.id, {
            regionId: region.id,
            previousOwner: previousOwner ?? null,
            newOwner: region.owner,
            animationParams: DEFAULT_FLOW_PARAMS,
            startedAt: nowSeconds,
          })
          snapshot.set(region.id, region.owner)
        }
      }

      for (const [regionId, flow] of ownershipFlowsRef.current) {
        if (nowSeconds - flow.startedAt > OWNERSHIP_FLOW_DURATION) {
          ownershipFlowsRef.current.delete(regionId)
        }
      }
    }

    const screenToMap = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      return {
        x: (clientX - rect.left - width * 0.5 - view.panX) / view.scale,
        y: (clientY - rect.top - height * 0.5 - view.panY) / view.scale,
      }
    }

    const updateHover = (event: PointerEvent) => {
      const layout = getLayout()
      const point = screenToMap(event.clientX, event.clientY)
      const radius = Math.min(width, height) * 0.42
      const cell = getRegionAtPoint(layout, point.x, point.y, radius)
      const region = cell?.region ?? null
      const tooltip = tooltipRef.current

      if (tooltip) {
        tooltip.style.transform = `translate(${event.offsetX + 14}px, ${event.offsetY + 14}px)`
      }

      if (hoverIdRef.current !== (region?.id ?? null)) {
        hoverIdRef.current = region?.id ?? null
        if (!region) {
          setHover(null)
          return
        }

        setHover({
          id: region.id,
          owner: region.owner ? factionMetaStore.getState().byId[region.owner]?.name ?? region.owner : '未占领',
          development: region.developmentLevel,
          terrain: region.terrain,
        })
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current.active) {
        const dx = event.clientX - dragRef.current.x
        const dy = event.clientY - dragRef.current.y
        dragRef.current.x = event.clientX
        dragRef.current.y = event.clientY
        viewRef.current.userPanX += dx
        viewRef.current.userPanY += dy
      }

      updateHover(event)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        dragRef.current = { active: true, x: event.clientX, y: event.clientY }
        canvas.setPointerCapture(event.pointerId)
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current.active) {
        dragRef.current.active = false
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    const onClick = (event: MouseEvent) => {
      const layout = getLayout()
      const point = screenToMap(event.clientX, event.clientY)
      const radius = Math.min(width, height) * 0.42
      const cell = getRegionAtPoint(layout, point.x, point.y, radius)
      if (cell) {
        useUIStore.getState().setMapFocus({ regionId: cell.region.id, factionId: cell.region.owner ?? undefined })
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const nextScale = viewRef.current.userScale + (event.deltaY > 0 ? -0.06 : 0.06)
      viewRef.current.userScale = clamp(nextScale, 0.85, 1.25)
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm') {
        return
      }

      viewRef.current.userScale = 1
      viewRef.current.userPanX = 0
      viewRef.current.userPanY = 0
      useUIStore.getState().setMapFocus(null)
    }

    const onMapReset = () => {
      viewRef.current.userScale = 1
      viewRef.current.userPanX = 0
      viewRef.current.userPanY = 0
      useUIStore.getState().setMapFocus(null)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    if (interactive) {
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointerleave', onPointerUp)
      canvas.addEventListener('click', onClick)
      canvas.addEventListener('wheel', onWheel, { passive: false })
      canvas.addEventListener('contextmenu', onContextMenu)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('diplomacy:map-reset', onMapReset)
    }

    const tick = (now: number) => {
      if (!mounted) {
        return
      }

      const layout = getLayout()
      const radius = Math.min(width, height) * 0.42
      const time = now / 1000
      syncOwnershipFlows(time)
      applyFocusTarget(viewRef.current, layout, radius)
      drawFrame(
        ctx,
        width,
        height,
        viewRef.current,
        layout,
        paletteRef.current ?? buildPalette(),
        time,
        ownershipFlowsRef.current,
        qualityOverride,
      )
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      mounted = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      if (interactive) {
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerleave', onPointerUp)
        canvas.removeEventListener('click', onClick)
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('contextmenu', onContextMenu)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('diplomacy:map-reset', onMapReset)
      }
    }
  }, [factionMetaLoadedAt, interactive, qualityOverride])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className={interactive ? 'block h-full w-full cursor-crosshair touch-none' : 'block h-full w-full'}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-20 min-w-40 border border-[color:rgba(196,228,255,0.28)] bg-[color:rgba(2,4,10,0.92)] px-3 py-2 font-hud text-[0.58rem] uppercase tracking-[0.14em] text-[color:var(--text-primary)] shadow-[0_0_22px_rgba(51,170,255,0.24)]"
        style={{ display: hover ? 'block' : 'none' }}
      >
        {hover ? (
          <div className="grid gap-1">
            <div className="text-[color:rgba(196,228,255,0.92)]">{hover.id}</div>
            <div className="text-[color:rgba(196,228,255,0.62)]">OWNER / {hover.owner}</div>
            <div className="text-[color:rgba(196,228,255,0.62)]">DEV / {hover.development}</div>
            <div className="text-[color:rgba(196,228,255,0.62)]">TERRAIN / {hover.terrain}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
