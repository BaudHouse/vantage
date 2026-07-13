import { describe, it, expect } from 'vitest'
import {
  conflictByCountry,
  deriveStats,
  eonetCentroid,
  type GeoEvent,
} from './feeds'

function ev(p: Partial<GeoEvent>): GeoEvent {
  return {
    id: p.id ?? 'x',
    kind: p.kind ?? 'conflict',
    lat: 0,
    lng: 0,
    title: p.title ?? 't',
    detail: p.detail ?? 'd',
    weight: p.weight ?? 0.5,
    time: p.time ?? Date.now(),
    country: p.country,
    count: p.count,
    precise: p.precise,
  }
}

describe('conflictByCountry — choropleth only counts precise events', () => {
  it('ignores source-country fallbacks so the US is not falsely lit', () => {
    const events = [
      ev({ country: 'Ukraine', count: 5, precise: true }),
      ev({ country: 'United States of America', count: 9, precise: false }), // fallback
    ]
    const out = conflictByCountry(events)
    expect(out['Ukraine']).toBe(5)
    expect(out['United States of America']).toBeUndefined()
  })

  it('aggregates counts per country', () => {
    const out = conflictByCountry([
      ev({ country: 'Syria', count: 3, precise: true }),
      ev({ country: 'Syria', count: 2, precise: true }),
    ])
    expect(out['Syria']).toBe(5)
  })
})

describe('eonetCentroid — Point + Polygon geometry', () => {
  it('reads a Point as [lat, lng]', () => {
    expect(eonetCentroid([10, 20])).toEqual([20, 10])
  })

  it('averages a Polygon ring to a centroid', () => {
    // a 0..10 square → centroid (5,5), returned [lat, lng]
    const poly = [[[0, 0], [0, 10], [10, 10], [10, 0]]]
    expect(eonetCentroid(poly)).toEqual([5, 5])
  })

  it('descends a MultiPolygon to its first ring', () => {
    const multi = [[[[0, 0], [0, 10], [10, 10], [10, 0]]]]
    expect(eonetCentroid(multi)).toEqual([5, 5])
  })

  it('rejects empty / non-finite / malformed geometry', () => {
    expect(eonetCentroid([])).toBeNull()
    expect(eonetCentroid('nope')).toBeNull()
    expect(eonetCentroid([NaN, 5])).toBeNull()
    expect(eonetCentroid([null, null])).toBeNull()
  })
})

describe('deriveStats', () => {
  it('classifies active (>=3) vs tension (1-2) hotspots', () => {
    const s = deriveStats([
      ev({ kind: 'conflict', count: 5 }),
      ev({ kind: 'conflict', count: 4 }),
      ev({ kind: 'conflict', count: 2 }),
      ev({ kind: 'quake' }),
    ])
    expect(s.active).toBe(2)
    expect(s.tensions).toBe(1)
  })
})
