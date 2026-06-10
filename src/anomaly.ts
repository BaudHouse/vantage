// Early-warning engine: scan each metric's recent history and flag values that
// are statistically abnormal vs their own rolling baseline. This is what turns
// Vantage from "what's happening" into "what's developing" — the leading signal
// you'd act on before it's obvious.

import type { Snapshot, TrendMetric } from './trends'

export interface Anomaly {
  key: string
  label: string
  current: number
  mean: number
  z: number // standard deviations above the baseline mean
  pct: number // percent above the baseline mean
}

export interface AnomalyOpts {
  minSnaps?: number // need at least this much history to judge "normal"
  z?: number // z-score threshold to flag
  window?: number // how many recent snapshots form the baseline
}

const DEFAULTS: Required<AnomalyOpts> = { minSnaps: 6, z: 2.5, window: 30 }

/**
 * Detect metrics whose latest value spikes abnormally above their recent
 * baseline. Only *rising* anomalies are flagged (an early-warning console
 * cares about escalation, not things calming down). Sorted most-severe first.
 */
export function detectAnomalies(
  snaps: Snapshot[],
  metrics: TrendMetric[],
  opts: AnomalyOpts = {},
): Anomaly[] {
  const { minSnaps, z: zThresh, window } = { ...DEFAULTS, ...opts }
  if (snaps.length < minSnaps) return []

  const recent = snaps.slice(-window)
  const out: Anomaly[] = []

  for (const m of metrics) {
    const series = recent.map((s) => s.m[m.key] ?? 0)
    const current = series[series.length - 1]
    // Baseline = everything before the latest reading.
    const base = series.slice(0, -1)
    if (base.length < minSnaps - 1) continue

    const mean = base.reduce((a, b) => a + b, 0) / base.length
    const variance =
      base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length
    const std = Math.sqrt(variance)

    // Need a real signal: rising, above baseline, and either a clear z-score
    // (when there's variance) or — for a previously flat metric — a meaningful
    // jump in absolute terms. A zero-variance baseline does NOT make every
    // uptick "infinitely abnormal"; it must clear the absolute floor.
    if (current <= mean) continue
    const hasVar = std > 1e-9
    const z = hasVar ? (current - mean) / std : 0
    const flatJump = !hasVar && current - mean >= 3
    if (!(hasVar && z >= zThresh) && !flatJump) continue

    const pct = mean > 1e-9 ? ((current - mean) / mean) * 100 : 100
    out.push({
      key: m.key,
      label: m.label,
      current,
      mean: Math.round(mean * 10) / 10,
      z: flatJump ? 99 : Math.round(z * 10) / 10,
      pct: Math.round(pct),
    })
  }

  return out.sort((a, b) => b.z - a.z)
}
