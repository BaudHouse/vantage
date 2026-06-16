import { describe, it, expect, beforeEach } from 'vitest'
import { scoreOf, recordCycle, loadScore, correct, clearScore } from './scorecard'
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
})
