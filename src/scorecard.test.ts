import { describe, it, expect, beforeEach } from 'vitest'
import {
  scoreOf,
  coverageOf,
  forecastTrust,
  recordCycle,
  loadScore,
  correct,
  clearScore,
  MIN_PAIRS,
} from './scorecard'
import { installStorage } from './test-helpers'

describe('scoreOf', () => {
  it('is empty for no pairs', () => {
    expect(scoreOf([])).toMatchObject({ n: 0, rmse: 0, skill: 0 })
  })

  it('measures RMSE, bias and direction accuracy', () => {
    // predictions consistently 2 high; directions all called correctly
    const pairs = [
      { p: 12, a: 10, prior: 8 }, // up predicted, up happened ✓
      { p: 7, a: 5, prior: 9 }, // down predicted, down happened ✓
      { p: 22, a: 20, prior: 18 }, // up/up ✓
    ]
    const s = scoreOf(pairs)
    expect(s.n).toBe(3)
    expect(s.bias).toBe(2) // +2 over-prediction
    expect(s.rmse).toBe(2)
    expect(s.hit).toBe(1) // all directions right
  })

  it('penalizes wrong-direction calls in hit rate', () => {
    const pairs = [
      { p: 12, a: 6, prior: 8 }, // predicted up, went down ✗
      { p: 6, a: 12, prior: 8 }, // predicted down, went up ✗
    ]
    expect(scoreOf(pairs).hit).toBe(0)
  })

  it('reports positive skill when it beats persistence', () => {
    // prediction nails it; persistence (prior) is far off
    const pairs = [
      { p: 20, a: 20, prior: 10 },
      { p: 30, a: 30, prior: 12 },
    ]
    const s = scoreOf(pairs)
    expect(s.rmse).toBe(0)
    expect(s.skill).toBe(1)
  })
})

describe('coverageOf (interval calibration)', () => {
  it('ignores pairs that carry no interval', () => {
    const c = coverageOf([
      { p: 10, a: 10, prior: 9 },
      { p: 5, a: 5, prior: 4 },
    ])
    expect(c).toEqual({ n: 0, covered: 0, rate: 0 })
  })

  it('counts realized values that land inside their band', () => {
    const c = coverageOf([
      { p: 10, a: 11, prior: 9, lo: 8, hi: 14 }, // 11 in [8,14] ✓
      { p: 10, a: 20, prior: 9, lo: 8, hi: 14 }, // 20 outside ✗
      { p: 10, a: 8, prior: 9, lo: 8, hi: 14 }, // 8 on the edge ✓
      { p: 10, a: 10, prior: 9 }, // no band → ignored
    ])
    expect(c.n).toBe(3)
    expect(c.covered).toBe(2)
    expect(c.rate).toBeCloseTo(2 / 3, 5)
  })
})

describe('forecastTrust (alert gating)', () => {
  const N = MIN_PAIRS
  it('is provisional on a fresh model with only a positive single-split skill', () => {
    // no realized track record yet (n < MIN_PAIRS) → falls back to split skill
    expect(forecastTrust(0, 0, 0.2)).toBe('provisional')
    expect(forecastTrust(0, N - 1, 0.2)).toBe('provisional')
  })
  it('is unproven when neither realized nor split skill clears the bar', () => {
    expect(forecastTrust(0, 0, 0.0)).toBe('unproven')
    expect(forecastTrust(0, N - 1, 0.01)).toBe('unproven')
  })
  it('is validated once a real track record still beats naive', () => {
    expect(forecastTrust(0.3, N, -1)).toBe('validated') // split skill irrelevant now
  })
  it('is UNPROVEN when a real track record shows the model failed', () => {
    // the key anti-cry-wolf case: high single-split skill, but it lost on real
    // outcomes → not trusted to drive an alert
    expect(forecastTrust(-0.1, N, 0.9)).toBe('unproven')
    expect(forecastTrust(0.0, N, 0.9)).toBe('unproven')
  })
})

describe('recordCycle + correct (outcome loop)', () => {
  beforeEach(() => {
    installStorage()
    clearScore()
  })

  it('resolves a prediction against the next cycle and learns bias', () => {
    // model always predicts +5 too high; feed a flat-ish series
    const actuals = [10, 10, 10, 10, 10, 10, 10, 10]
    actuals.forEach((a) => recordCycle('quakes', a, () => a + 5))
    const e = loadScore()['quakes']
    // first cycle has no pending to resolve → pairs = actuals.length - 1
    expect(e.pairs.length).toBe(actuals.length - 1)
    const s = scoreOf(e.pairs)
    expect(s.bias).toBeCloseTo(5, 0) // learned the +5 over-prediction
    // correction subtracts the bias once enough pairs exist
    expect(correct('quakes', 100)).toBeCloseTo(95, 0)
  })

  it('does not correct before enough pairs accumulate', () => {
    recordCycle('fires', 3, () => 8)
    recordCycle('fires', 3, () => 8) // 1 pair only
    expect(correct('fires', 50)).toBe(50)
  })

  it('stages a forecast band and resolves it into the pair for coverage', () => {
    // first cycle stages p=12 with band [9,15]; second cycle resolves a=13
    recordCycle('storms', 10, () => ({ p: 12, lo: 9, hi: 15 }))
    recordCycle('storms', 13, () => ({ p: 14, lo: 11, hi: 17 }))
    const pair = loadScore()['storms'].pairs[0]
    expect(pair).toMatchObject({ p: 12, a: 13, lo: 9, hi: 15 })
    expect(coverageOf(loadScore()['storms'].pairs)).toMatchObject({
      n: 1,
      covered: 1, // 13 fell inside [9,15]
    })
  })
})
