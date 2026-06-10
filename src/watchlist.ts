// Watchlist: pin regions/countries and get alerted when conflict activity
// there rises above the level you last acknowledged. Turns the passive board
// into a proactive monitor. All state is local (localStorage), no backend.

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
  try {
    const a = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')
    return Array.isArray(a) ? (a as string[]) : []
  } catch {
    return []
  }
}

export function saveWatch(names: string[]): void {
  try {
    localStorage.setItem(
      WATCH_KEY,
      JSON.stringify([...new Set(names)].slice(0, MAX)),
    )
  } catch {
    /* best-effort */
  }
}

export function loadBaseline(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(BASE_KEY) || '{}')
    return o && typeof o === 'object' ? (o as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function saveBaseline(counts: Record<string, number>): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(counts))
  } catch {
    /* best-effort */
  }
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
