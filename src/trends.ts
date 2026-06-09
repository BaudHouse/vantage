// Lightweight historical tracking: snapshot key layer counts to localStorage
// each refresh so we can show how the global picture is trending over time.

export interface Snapshot {
  t: number // epoch ms
  m: Record<string, number>
}

const KEY = 'vantage.trends.v1'
const MAX = 400 // ring buffer (~13h at the 120s refresh)

export function recordSnapshot(m: Record<string, number>): void {
  try {
    const arr = getTrends()
    const last = arr[arr.length - 1]
    // De-dupe: skip if nothing changed since the last snapshot.
    if (last && JSON.stringify(last.m) === JSON.stringify(m)) return
    arr.push({ t: Date.now(), m })
    while (arr.length > MAX) arr.shift()
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch {
    /* quota / private mode — trends are best-effort */
  }
}

export function getTrends(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Snapshot[]
  } catch {
    return []
  }
}

export function clearTrends(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
