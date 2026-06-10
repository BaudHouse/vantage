// Lightweight historical tracking: snapshot key layer counts to localStorage
// each refresh so we can show how the global picture is trending over time.

export interface Snapshot {
  t: number // epoch ms
  m: Record<string, number>
}

// The metrics we snapshot + chart + run anomaly detection over. Shared so the
// trends panel, the early-warning engine and the App badge stay in sync.
export interface TrendMetric {
  key: string
  label: string
  color: string
}

export const TREND_METRICS: TrendMetric[] = [
  { key: 'active', label: 'Active conflict zones', color: '#ff4d4d' },
  { key: 'tensions', label: 'Tension zones', color: '#ffb000' },
  { key: 'quakes', label: 'Earthquakes (24h)', color: '#ffd24d' },
  { key: 'hazards', label: 'Hazard alerts (GDACS)', color: '#ff9500' },
  { key: 'storms', label: 'Tropical cyclones', color: '#4dd0e1' },
  { key: 'fires', label: 'Wildfires', color: '#ff7a1a' },
  { key: 'aircraft', label: 'Aircraft tracked', color: '#e8eefc' },
  { key: 'ships', label: 'Vessels (AIS)', color: '#3ddc97' },
  { key: 'alerts', label: 'Severe wx alerts (US)', color: '#ffd24d' },
  { key: 'airquality', label: 'AQI stations', color: '#7e57c2' },
]

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
