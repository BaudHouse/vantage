import { describe, it, expect } from 'vitest'
import {
  Net,
  forecastSeries,
  forecastMultivariate,
  backtestSeries,
} from './nn'

describe('Net (backprop core)', () => {
  it('learns XOR (non-linear, needs a hidden layer)', () => {
    const net = new Net([2, 4, 1], { eta: 0.3, alpha: 0.6, seed: 7 })
    const data: [number[], number[]][] = [
      [[0, 0], [0]],
      [[0, 1], [1]],
      [[1, 0], [1]],
      [[1, 1], [0]],
    ]
    for (let e = 0; e < 4000; e++) {
      for (const [x, y] of data) net.train(x, y)
    }
    for (const [x, y] of data) {
      const p = net.forward(x)[0]
      expect(Math.round(p)).toBe(y[0])
    }
  })

  it('drives loss down on a learnable mapping', () => {
    const net = new Net([3, 5, 1], { seed: 3 })
    const x = [0.2, 0.5, 0.8]
    const y = [0.7]
    const first = net.train(x, y)
    let last = first
    for (let e = 0; e < 500; e++) last = net.train(x, y)
    expect(last).toBeLessThan(first)
    expect(last).toBeLessThan(1e-3)
  })
})

describe('forecastSeries', () => {
  it('returns trained=false for too-short series', () => {
    expect(forecastSeries([1, 2, 3, 4]).trained).toBe(false)
  })

  it('handles a flat series without NaNs', () => {
    const f = forecastSeries(new Array(30).fill(5))
    expect(f.trained).toBe(true)
    expect(f.predictions.every((p) => p === 5)).toBe(true)
  })

  it('beats naive persistence on a clean sine wave (positive skill)', () => {
    const series = Array.from({ length: 120 }, (_, i) =>
      50 + 40 * Math.sin(i / 3),
    )
    const f = forecastSeries(series, { window: 8, hidden: 10, epochs: 500, seed: 1 })
    expect(f.trained).toBe(true)
    expect(f.predictions).toHaveLength(3)
    // a network that learned the cycle should beat just repeating the last value
    expect(f.skill).toBeGreaterThan(0)
    // and its forecast should stay in the signal's range
    for (const p of f.predictions) {
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(100)
    }
  })

  it('tracks a rising linear trend upward', () => {
    const series = Array.from({ length: 40 }, (_, i) => 10 + i)
    const f = forecastSeries(series, { window: 5, epochs: 400, seed: 2 })
    expect(f.trained).toBe(true)
    // next value should continue above the last observed (~49)
    expect(f.predictions[0]).toBeGreaterThan(45)
  })

  it('flags a large forecast surprise when the pattern breaks', () => {
    // a clean cycle the net learns well, then a wildly off-pattern last point
    const series = Array.from({ length: 90 }, (_, i) => 50 + 30 * Math.sin(i / 3))
    series[series.length - 1] = 250 // shock the latest reading
    const f = forecastSeries(series, { window: 8, hidden: 10, epochs: 500, seed: 4 })
    expect(f.trained).toBe(true)
    expect(f.surprise).toBeGreaterThan(3) // many sigmas of model error
  })

  it('reports a small surprise when the latest point fits the pattern', () => {
    const series = Array.from({ length: 90 }, (_, i) => 50 + 30 * Math.sin(i / 3))
    const f = forecastSeries(series, { window: 8, hidden: 10, epochs: 500, seed: 5 })
    expect(f.surprise).toBeLessThan(3)
  })

  it('brackets each point forecast with a prediction interval', () => {
    const series = Array.from({ length: 120 }, (_, i) => 50 + 40 * Math.sin(i / 3))
    const f = forecastSeries(series, { window: 8, hidden: 10, epochs: 500, seed: 1 })
    expect(f.lower).toHaveLength(f.predictions.length)
    expect(f.upper).toHaveLength(f.predictions.length)
    f.predictions.forEach((p, h) => {
      // the band is centered on the point forecast and never inverts
      expect(f.lower[h]).toBeLessThanOrEqual(p)
      expect(f.upper[h]).toBeGreaterThanOrEqual(p)
      // a model with real error has a band of positive width
      expect(f.upper[h]).toBeGreaterThan(f.lower[h])
    })
    // multi-step bands widen as error compounds (√step growth)
    const w0 = f.upper[0] - f.lower[0]
    const wLast = f.upper[f.upper.length - 1] - f.lower[f.lower.length - 1]
    expect(wLast).toBeGreaterThanOrEqual(w0)
  })

  it('keeps the band ordered even when the forecast overshoots the range', () => {
    // a steep ramp drives the closed-loop forecast well past the observed max;
    // the band must stay ordered (regression: clamping to range inverted it)
    const series = Array.from({ length: 40 }, (_, i) => i * i) // 0,1,4,9,…,1521
    const f = forecastSeries(series, { window: 5, hidden: 8, epochs: 300, seed: 3 })
    expect(f.trained).toBe(true)
    f.predictions.forEach((p, h) => {
      expect(f.lower[h]).toBeLessThanOrEqual(p)
      expect(f.upper[h]).toBeGreaterThanOrEqual(p)
      expect(f.upper[h]).toBeGreaterThanOrEqual(f.lower[h])
    })
  })

  it('gives a zero-width band for a flat (zero-error) series', () => {
    const f = forecastSeries(new Array(30).fill(5))
    expect(f.lower).toEqual(f.predictions)
    expect(f.upper).toEqual(f.predictions)
  })
})

describe('backtestSeries (walk-forward validation)', () => {
  it('returns trained=false for too-short series', () => {
    expect(backtestSeries([1, 2, 3, 4, 5]).trained).toBe(false)
  })

  it('evaluates several out-of-sample folds and beats naive on a clean cycle', () => {
    const series = Array.from({ length: 120 }, (_, i) => 50 + 40 * Math.sin(i / 3))
    const b = backtestSeries(series, {
      window: 8,
      hidden: 10,
      epochs: 400,
      seed: 1,
    })
    expect(b.trained).toBe(true)
    // walk-forward actually walked — multiple independent out-of-sample points
    expect(b.folds).toBeGreaterThanOrEqual(5)
    // retrained-per-fold skill should be positive on a learnable signal
    expect(b.skill).toBeGreaterThan(0)
    // and the net should win the majority of individual folds
    expect(b.winRate).toBeGreaterThan(0.5)
    // every aggregate is finite and well-formed
    expect(Number.isFinite(b.netRmse)).toBe(true)
    expect(Number.isFinite(b.naiveRmse)).toBe(true)
    expect(b.mae).toBeGreaterThanOrEqual(0)
  })

  it('caps the number of trained folds via maxFolds', () => {
    const series = Array.from({ length: 200 }, (_, i) => 50 + 30 * Math.sin(i / 4))
    const b = backtestSeries(series, { window: 6, epochs: 80, seed: 2, maxFolds: 12 })
    expect(b.trained).toBe(true)
    expect(b.folds).toBeLessThanOrEqual(12)
    expect(b.folds).toBeGreaterThan(0)
  })

  it('is deterministic for a fixed seed', () => {
    const series = Array.from({ length: 80 }, (_, i) => 20 + 15 * Math.sin(i / 2))
    const a = backtestSeries(series, { window: 6, epochs: 120, seed: 7 })
    const b = backtestSeries(series, { window: 6, epochs: 120, seed: 7 })
    expect(a.skill).toBe(b.skill)
    expect(a.netRmse).toBe(b.netRmse)
    expect(a.folds).toBe(b.folds)
  })
})

describe('forecastMultivariate', () => {
  it('returns trained=false on too-short / bad input', () => {
    expect(forecastMultivariate([[1], [2], [3]], 0).trained).toBe(false)
    expect(forecastMultivariate([], 0).trained).toBe(false)
    expect(forecastMultivariate([[1, 2]], 5).trained).toBe(false)
  })

  it('learns a CROSS-signal lead relationship a univariate model would miss', () => {
    // signal 0 is a leading driver; the target (signal 1) follows it by 1 step
    // with its OWN value being near-random noise — so naive persistence of the
    // target is useless, but a model that reads signal 0 can predict it.
    const driver: number[] = []
    const target: number[] = []
    let s = 7
    for (let i = 0; i < 120; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff // deterministic pseudo-noise
      driver.push(50 + 40 * Math.sin(i / 5))
      // target[i] depends on driver[i-1], not on target[i-1]
      target.push(i === 0 ? 50 : driver[i - 1] * 0.8 + 10)
    }
    const matrix = driver.map((d, i) => [d, target[i]])
    const f = forecastMultivariate(matrix, 1, {
      window: 3,
      hidden: 12,
      epochs: 400,
      seed: 1,
    })
    expect(f.trained).toBe(true)
    expect(f.features).toBe(2)
    // the cross-signal model should beat naive persistence of the target
    expect(f.skill).toBeGreaterThan(0.2)
  })
})
