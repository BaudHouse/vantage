import { describe, it, expect } from 'vitest'
import {
  brierScore,
  brierSkill,
  reliability,
  type Resolution,
} from './calibration'

function rs(pairs: [number, 0 | 1][]): Resolution[] {
  return pairs.map(([prob, outcome], i) => ({
    id: `q${i}`,
    question: `q${i}`,
    prob,
    outcome,
    t: i,
  }))
}

describe('brierScore', () => {
  it('is null with no resolutions', () => {
    expect(brierScore([])).toBeNull()
  })
  it('is 0 for perfect confident forecasts', () => {
    expect(brierScore(rs([[100, 1], [0, 0], [100, 1]]))).toBe(0)
  })
  it('is 1 for maximally-wrong confident forecasts', () => {
    expect(brierScore(rs([[100, 0], [0, 1]]))).toBe(1)
  })
  it('is 0.25 for always-50% forecasts', () => {
    expect(brierScore(rs([[50, 1], [50, 0], [50, 1], [50, 0]]))).toBe(0.25)
  })
})

describe('brierSkill', () => {
  it('is null below a handful of resolutions', () => {
    expect(brierSkill(rs([[80, 1], [20, 0]]))).toBeNull()
  })
  it('is positive when forecasts beat the base rate', () => {
    // confident and correct → much better than predicting the 50% base rate
    const s = brierSkill(
      rs([[90, 1], [10, 0], [85, 1], [15, 0], [88, 1], [12, 0]]),
    )
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(0.5)
  })
})

describe('reliability', () => {
  it('buckets forecasts and compares predicted vs actual frequency', () => {
    // low bucket: predicted ~10%, none happened (0%); high bucket: ~90%, all happened
    const bins = reliability(
      rs([
        [10, 0], [12, 0], [8, 0],
        [90, 1], [88, 1], [92, 1],
      ]),
      5,
    )
    const low = bins.find((b) => b.lo === 0)!
    const high = bins.find((b) => b.hi === 100)!
    expect(low.actual).toBe(0)
    expect(high.actual).toBe(100)
    expect(low.n).toBe(3)
    expect(high.n).toBe(3)
  })
  it('skips empty buckets', () => {
    expect(reliability(rs([[95, 1]]), 5).length).toBe(1)
  })
})
