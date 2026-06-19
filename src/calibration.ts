// Calibration tracking for PROBABILISTIC forecasts (the prediction-market /
// Operator questions). The superforecaster's discipline: when you say "70%",
// does it actually happen ~70% of the time? We log each resolved forecast as
// (probability, outcome) and score it with the Brier score + a reliability
// curve. Most "AI predictions" never do this — it's what separates a calibrated
// forecaster from a confident-sounding one.

import { loadJson, saveJson } from './storage'

export interface Resolution {
  id: string
  question: string
  prob: number // 0..100, the forecast probability of YES at resolution time
  outcome: 0 | 1 // 1 = it happened (YES), 0 = it didn't
  t: number // epoch ms resolved
}

const KEY = 'vantage.calibration.v1'
const CAP = 300

export function loadResolutions(): Resolution[] {
  const a = loadJson<Resolution[]>(KEY, [])
  return Array.isArray(a)
    ? a.filter(
        (r): r is Resolution =>
          !!r &&
          typeof r === 'object' &&
          typeof r.prob === 'number' &&
          (r.outcome === 0 || r.outcome === 1),
      )
    : []
}

export function resolve(r: Omit<Resolution, 't'> & { t?: number }): void {
  const all = loadResolutions().filter((x) => x.id !== r.id)
  all.push({ ...r, t: r.t ?? Date.now() })
  while (all.length > CAP) all.shift()
  saveJson(KEY, all)
}

export function unresolve(id: string): void {
  saveJson(
    KEY,
    loadResolutions().filter((x) => x.id !== id),
  )
}

/** Brier score: mean((p - outcome)^2), p in [0,1]. 0 = perfect, 0.25 = always
 *  50/50, lower is better. Returns null if there's nothing scored. */
export function brierScore(rs: Resolution[]): number | null {
  if (!rs.length) return null
  let s = 0
  for (const r of rs) s += (r.prob / 100 - r.outcome) ** 2
  return Math.round((s / rs.length) * 1000) / 1000
}

/**
 * Brier skill score vs the no-skill base rate (always predicting the observed
 * frequency of YES). >0 means the forecasts add real discrimination. Null if
 * fewer than a handful of resolutions or the base rate is degenerate.
 */
export function brierSkill(rs: Resolution[]): number | null {
  if (rs.length < 5) return null
  const bs = brierScore(rs)
  if (bs == null) return null
  const base = rs.reduce((a, r) => a + r.outcome, 0) / rs.length
  const ref = base * (1 - base) // Brier of always predicting the base rate
  if (ref < 1e-9) return null
  return Math.round((1 - bs / ref) * 100) / 100
}

export interface Bin {
  lo: number // bucket lower bound (%)
  hi: number
  n: number
  predicted: number // mean predicted % in the bucket
  actual: number // observed YES frequency (%)
}

/** Reliability curve: bucket forecasts by predicted probability and compare the
 *  mean prediction to the observed frequency in each bucket. */
export function reliability(rs: Resolution[], buckets = 5): Bin[] {
  const out: Bin[] = []
  const w = 100 / buckets
  for (let b = 0; b < buckets; b++) {
    const lo = b * w
    const hi = b === buckets - 1 ? 100 : (b + 1) * w
    const inB = rs.filter((r) => r.prob >= lo && (r.prob < hi || (b === buckets - 1 && r.prob <= hi)))
    if (!inB.length) continue
    out.push({
      lo,
      hi,
      n: inB.length,
      predicted: Math.round((inB.reduce((a, r) => a + r.prob, 0) / inB.length) * 10) / 10,
      actual: Math.round((inB.reduce((a, r) => a + r.outcome, 0) / inB.length) * 1000) / 10,
    })
  }
  return out
}
