import { describe, it, expect, beforeEach } from 'vitest'
import { recordSnapshot, getTrends, clearTrends } from './trends'
import { installStorage } from './test-helpers'

describe('trends', () => {
  beforeEach(() => {
    installStorage()
    clearTrends()
  })

  it('records snapshots and reads them back', () => {
    recordSnapshot({ active: 5, quakes: 10 })
    const t = getTrends()
    expect(t).toHaveLength(1)
    expect(t[0].m).toEqual({ active: 5, quakes: 10 })
    expect(typeof t[0].t).toBe('number')
  })

  it('de-dupes an unchanged consecutive snapshot', () => {
    recordSnapshot({ active: 5 })
    recordSnapshot({ active: 5 })
    expect(getTrends()).toHaveLength(1)
  })

  it('appends when a value changes', () => {
    recordSnapshot({ active: 5 })
    recordSnapshot({ active: 6 })
    expect(getTrends().map((s) => s.m.active)).toEqual([5, 6])
  })

  it('caps history to the ring-buffer max', () => {
    for (let i = 0; i < 450; i++) recordSnapshot({ active: i })
    const t = getTrends()
    expect(t.length).toBeLessThanOrEqual(400)
    // Oldest entries are dropped, newest kept.
    expect(t[t.length - 1].m.active).toBe(449)
  })

  it('returns an empty array before anything is recorded', () => {
    expect(getTrends()).toEqual([])
  })
})
