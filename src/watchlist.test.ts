import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadWatch,
  saveWatch,
  loadBaseline,
  saveBaseline,
  computeAlerts,
} from './watchlist'

function installStorage() {
  const map = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

describe('watchlist persistence', () => {
  beforeEach(installStorage)

  it('round-trips the watch list and de-dupes', () => {
    expect(loadWatch()).toEqual([])
    saveWatch(['Ukraine', 'Sudan', 'Ukraine'])
    expect(loadWatch()).toEqual(['Ukraine', 'Sudan'])
  })

  it('round-trips the baseline map', () => {
    saveBaseline({ Ukraine: 12 })
    expect(loadBaseline()).toEqual({ Ukraine: 12 })
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('vantage.watch.v1', 'nope')
    localStorage.setItem('vantage.watchbase.v1', 'nope')
    expect(loadWatch()).toEqual([])
    expect(loadBaseline()).toEqual({})
  })
})

describe('computeAlerts', () => {
  it('flags only watched countries that rose above baseline', () => {
    const alerts = computeAlerts(
      ['Ukraine', 'Sudan', 'Yemen'],
      { Ukraine: 15, Sudan: 8, Yemen: 3, Mali: 20 },
      { Ukraine: 10, Sudan: 8, Yemen: 1 },
    )
    // Sudan unchanged (8 == 8) → no alert; Mali not watched → ignored.
    expect(alerts.map((a) => a.name)).toEqual(['Ukraine', 'Yemen'])
  })

  it('sorts by largest escalation first', () => {
    const alerts = computeAlerts(
      ['A', 'B'],
      { A: 5, B: 30 },
      { A: 1, B: 1 },
    )
    expect(alerts[0].name).toBe('B')
    expect(alerts[0].delta).toBe(29)
    expect(alerts[1].delta).toBe(4)
  })

  it('treats a missing baseline as zero (new activity alerts)', () => {
    const alerts = computeAlerts(['Gaza'], { Gaza: 4 }, {})
    expect(alerts).toEqual([
      { name: 'Gaza', current: 4, baseline: 0, delta: 4 },
    ])
  })

  it('returns nothing when activity is at or below baseline', () => {
    expect(computeAlerts(['X'], { X: 2 }, { X: 5 })).toEqual([])
    expect(computeAlerts([], { X: 99 }, {})).toEqual([])
  })
})
