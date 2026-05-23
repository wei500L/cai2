/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { buildArcsData, buildHtmlElementsData, buildPointsData, buildRingsData, createLabelDiv } from '../dataLayers'

describe('globe data layers', () => {
  it('maps arcs, points, rings and labels into globe.gl-friendly data', () => {
    const arcs = buildArcsData([
      {
        id: 'arc-1',
        kind: 'private',
        source_faction_id: 'starlight',
        target_faction_id: 'emerald',
        start_lat: 10,
        start_lng: 20,
        end_lat: -10,
        end_lng: -20,
        color: ['#33aaff', '#33ff77'],
        ttl_ms: 2_000,
        created_at_ms: 1_000,
      },
      {
        id: 'arc-2',
        kind: 'speech',
        source_faction_id: 'emerald',
        target_faction_id: 'magma',
        start_lat: 30,
        start_lng: 40,
        end_lat: 50,
        end_lng: 60,
        color: ['#33ff77', '#ff6633'],
        ttl_ms: 1_800,
        created_at_ms: 1_100,
      },
    ])

    expect(arcs[0]).toMatchObject({
      startLat: 10,
      startLng: 20,
      endLat: -10,
      endLng: -20,
      color: ['#33aaff', '#33ff77'],
      stroke: 0.6,
      dashLength: 0.3,
      dashGap: 0.05,
      dashAnimateTime: 2_000,
    })
    expect(arcs[1].dashAnimateTime).toBe(1_500)

    const points = buildPointsData([
      {
        id: 'starlight',
        lat: 10,
        lng: 20,
        name: '星辉联邦',
        glow: '#33aaff',
        badge: '友好',
      },
    ])

    expect(points).toEqual([
      {
        id: 'starlight',
        lat: 10,
        lng: 20,
        color: '#33aaff',
        radius: 0.6,
        altitude: 0.01,
        label: '星辉联邦',
      },
    ])

    const rings = buildRingsData([
      {
        id: 'ripple-1',
        lat: 5,
        lng: 6,
        max_radius: 4.2,
        ttl_ms: 1_800,
        color: '#33aaff',
        created_at_ms: 1_000,
      },
    ])

    expect(rings[0].maxR).toBe(4.2)
    expect(rings[0].propagationSpeed).toBeCloseTo((4.2 / 1_800) * 1_000)
    expect(rings[0].repeatPeriod).toBe(1_800)

    const labels = buildHtmlElementsData([
      {
        id: 'starlight',
        lat: 10,
        lng: 20,
        name: '星辉联邦',
        glow: '#33aaff',
        badge: '友好',
      },
    ])

    expect(labels[0]).toMatchObject({
      id: 'starlight',
      lat: 10,
      lng: 20,
      name: '星辉联邦',
      badge: '友好',
    })

    const labelEl = createLabelDiv(labels[0])
    expect(labelEl.className).toContain('factionLabelAnchor')
    expect(labelEl.firstElementChild?.className).toContain('factionLabel')
    expect(labelEl.textContent).toContain('星辉联邦')
    expect(labelEl.textContent).toContain('友好')
  })
})
