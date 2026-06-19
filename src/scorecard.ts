// Outcome-driven learning: every cycle the forecaster makes a 1-step prediction
// for each tracked metric; the NEXT cycle's real value resolves it. We keep the
// (predicted, actual) pairs and learn from them — realized error, systematic
// bias, and direction accuracy — then correct future forecasts by the bias.
// This is the part most "AI forecasts" skip: scoring against what actually
// happened, not a held-out slice of the past.

import { loadJson, saveJson } from './storage'

export interface Pair {
  p: number // predicted (made last cycle, from history up to then)
  a: number // realized this cycle
  prior: number // the value when the prediction was made (for direction)
}

export interface MetricScore {
  n: number
  rmse: number // realized forward RMSE (lower = better)
  bias: number // mean(predicted - actual); >0 = it over-predicts
  hit: number // 0..1 fraction of moves whose DIRECTION it called right
  naiveRmse: number // persistence baseline on the same realized pairs
  skill: number // 1 - rmse/naiveRmse on realized outcomes
}

interface Entry {
  pendingP?: number
  pendingPrior?: number
  pairs: Pair[]
}
type Store = Record<string, Entry>

const KEY = 'vantage.scorecard.v1'
const CAP = 80 // rolling window of realized pairs per metric
export const MIN_PAIRS = 6 // before we trust the learned bias

export function loadScore(): Store {
  const s = loadJson<Store>(KEY, {})
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {}
}

/** Pure: realized accuracy stats from a metric's (predicted, actual) pairs. */
export function scoreOf(pairs: Pair[]): MetricScore {
  const n = pairs.length
  if (!n)
    return { n: 0, rmse: 0, bias: 0, hit: 0, naiveRmse: 0, skill: 0 }
  let se = 0
  let naive = 0
  let biasSum = 0
  let dirN = 0
  let dirHit = 0
  for (const { p, a, prior } of pairs) {
    se += (p - a) ** 2
    naive += (prior - a) ** 2 // persistence: "it'll stay where it was"
    biasSum += p - a
    if (a !== prior) {
      dirN++
      if (Math.sign(p - prior) === Math.sign(a - prior)) dirHit++
    }
  }
  const rmse = Math.sqrt(se / n)
  const naiveRmse = Math.sqrt(naive / n)
  return {
    n,
    rmse: Math.round(rmse * 10) / 10,
    bias: Math.round((biasSum / n) * 10) / 10,
    hit: dirN ? dirHit / dirN : 0,
    naiveRmse: Math.round(naiveRmse * 10) / 10,
    skill: naiveRmse > 1e-9 ? 1 - rmse / naiveRmse : 0,
  }
}

/**
 * Resolve last cycle's prediction for `metric` against the value that just
 * arrived, then stage a new prediction for next cycle. `predictNext` returns
 * the model's 1-step forecast from history up to now.
 */
export function recordCycle(
  metric: string,
  actual: number,
  predictNext: () => number,
): void {
  const s = loadScore()
  const m: Entry = s[metric] ?? { pairs: [] }
  if (m.pendingP !== undefined && m.pendingPrior !== undefined) {
    m.pairs.push({ p: m.pendingP, a: actual, prior: m.pendingPrior })
    while (m.pairs.length > CAP) m.pairs.shift()
  }
  m.pendingPrior = actual
  m.pendingP = predictNext()
  s[metric] = m
  saveJson(KEY, s)
}

/** The learned systematic-bias correction for a raw forecast (once we trust it). */
export function correct(metric: string, raw: number): number {
  const e = loadScore()[metric]
  if (!e || e.pairs.length < MIN_PAIRS) return raw
  const { bias } = scoreOf(e.pairs)
  return Math.round((raw - bias) * 10) / 10
}

export function clearScore(): void {
  saveJson(KEY, {})
}
