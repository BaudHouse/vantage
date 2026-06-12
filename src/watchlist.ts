// Watchlist: pin regions/countries and get alerted when conflict activity
// there rises above the level you last acknowledged. Turns the passive board
// into a proactive monitor. All state is local (localStorage), no backend.

import { loadJson, saveJson } from './storage'

export interface WatchAlert {
  name: string
  current: number
  baseline: number
  delta: number
}

const WATCH_KEY = 'vantage.watch.v1'
const BASE_KEY = 'vantage.watchbase.v1'
const NOTIFY_KEY = 'vantage.notify.v1'
const MAX = 40

export function loadNotify(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1'
  } catch {
    return false
  }
}

export function saveNotify(on: boolean): void {
  try {
    localStorage.setItem(NOTIFY_KEY, on ? '1' : '0')
  } catch {
    /* best-effort */
  }
}

export function loadWatch(): string[] {
  const a = loadJson<string[]>(WATCH_KEY, [])
  return Array.isArray(a) ? a : []
}

export function saveWatch(names: string[]): void {
  saveJson(WATCH_KEY, [...new Set(names)].slice(0, MAX))
}

export function loadBaseline(): Record<string, number> {
  const o = loadJson<Record<string, number>>(BASE_KEY, {})
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {}
}

export function saveBaseline(counts: Record<string, number>): void {
  saveJson(BASE_KEY, counts)
}

/**
 * Watched countries whose current conflict count exceeds the acknowledged
 * baseline, most-escalated first. Unwatched countries never alert.
 */
export function computeAlerts(
  watch: string[],
  intensity: Record<string, number>,
  baseline: Record<string, number>,
): WatchAlert[] {
  const out: WatchAlert[] = []
  for (const name of watch) {
    const current = intensity[name] ?? 0
    const base = baseline[name] ?? 0
    if (current > base) {
      out.push({ name, current, baseline: base, delta: current - base })
    }
  }
  return out.sort((a, b) => b.delta - a.delta)
}
