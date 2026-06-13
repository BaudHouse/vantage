import { describe, it, expect } from 'vitest'
import { Net, forecastSeries } from './nn'

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
})
