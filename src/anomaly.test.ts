import { describe, it, expect } from 'vitest'
import { detectAnomalies } from './anomaly'
import type { Snapshot, TrendMetric } from './trends'

const METRICS: TrendMetric[] = [
  { key: 'quakes', label: 'Earthquakes (24h)', color: '#fff' },
  { key: 'active', label: 'Active conflict zones', color: '#fff' },
]

function snaps(quakes: number[], active: number[] = []): Snapshot[] {
  return quakes.map((q, i) => ({
    t: 1_700_000_000_000 + i * 120_000,
    m: { quakes: q, active: active[i] ?? 0 },
  }))
}

describe('detectAnomalies', () => {
  it('returns nothing without enough history', () => {
    expect(detectAnomalies(snaps([10, 11, 12]), METRICS)).toEqual([])
  })

  it('flags a clear spike above a stable baseline', () => {
    // baseline ~10 with small noise, then jumps to 40
    const s = snaps([10, 11, 9, 10, 11, 10, 9, 40])
    const a = detectAnomalies(s, METRICS)
    expect(a.map((x) => x.key)).toContain('quakes')
    const q = a.find((x) => x.key === 'quakes')!
    expect(q.current).toBe(40)
    expect(q.z).toBeGreaterThan(2.5)
    expect(q.pct).toBeGreaterThan(100)
  })

  it('does NOT flag steady values', () => {
    expect(detectAnomalies(snaps([10, 10, 10, 10, 10, 10, 10]), METRICS)).toEqual(
      [],
    )
  })

  it('does NOT flag a drop (only rising anomalies)', () => {
    const s = snaps([40, 41, 39, 40, 41, 40, 39, 5])
    expect(detectAnomalies(s, METRICS)).toEqual([])
  })

  it('flags a jump from a previously-flat (zero-variance) metric', () => {
    // conflict flat at 2 for a while, then jumps to 9 (≥3 absolute jump)
    const s = snaps(
      [10, 10, 10, 10, 10, 10, 10, 10],
      [2, 2, 2, 2, 2, 2, 2, 9],
    )
    const a = detectAnomalies(s, METRICS)
    expect(a.map((x) => x.key)).toContain('active')
  })

  it('does not flag a tiny flat-metric wobble below the absolute floor', () => {
    const s = snaps(
      [10, 10, 10, 10, 10, 10, 10, 10],
      [2, 2, 2, 2, 2, 2, 2, 3],
    )
    const a = detectAnomalies(s, METRICS)
    expect(a.find((x) => x.key === 'active')).toBeUndefined()
  })

  it('sorts the most severe anomaly first', () => {
    const s = snaps(
      [10, 11, 9, 10, 11, 10, 9, 30], // quakes spike
      [5, 6, 4, 5, 6, 5, 4, 60], // bigger conflict spike
    )
    const a = detectAnomalies(s, METRICS)
    expect(a[0].key).toBe('active')
  })

  it('respects a custom z threshold', () => {
    // baseline mean ~9.4, std ~4.0, current 18 → z ~2.16 (between 1.5 and 2.5)
    const s = snaps([6, 14, 6, 14, 6, 14, 6, 18])
    expect(detectAnomalies(s, METRICS, { z: 2.5 })).toEqual([])
    expect(detectAnomalies(s, METRICS, { z: 1.5 }).length).toBeGreaterThan(0)
  })
})
