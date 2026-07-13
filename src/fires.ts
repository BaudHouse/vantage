// Wildfires / thermal anomalies. Works KEYLESS out of the box via NASA EONET
// (named active wildfire events). If a free NASA FIRMS MAP_KEY is present
// (VITE_FIRMS_KEY, from https://firms.modaps.eosdis.nasa.gov/api/map_key/) we
// additionally pull the dense VIIRS thermal-pixel feed for far more detail.

import type { Fire } from './layers'
import { getKey, rawFetch } from './net'
import { eonetCentroid } from './feeds'

const DEV = import.meta.env.DEV
const FIRMS = DEV ? '/feeds/firms' : 'https://firms.modaps.eosdis.nasa.gov'
const EONET = DEV ? '/feeds/eonet' : 'https://eonet.gsfc.nasa.gov/api/v3'
const firmsKey = () => getKey('VITE_FIRMS_KEY')

// The layer is always usable now (EONET needs no key). FIRMS just enriches it.
export function firesEnabled(): boolean {
  return true
}

export function firmsEnabled(): boolean {
  return !!firmsKey()
}

/** Keyless baseline: named active wildfires from NASA EONET. */
async function fetchEonetFires(): Promise<Fire[]> {
  try {
    const r = await rawFetch(
      `${EONET}/events?status=open&category=wildfires&limit=200`,
      { ms: 10000 },
    )
    if (!r || !r.ok) return []
    const j = await r.json()
    const out: Fire[] = []
    for (const e of j?.events ?? []) {
      const geoms: any[] = e?.geometry ?? []
      const g = geoms[geoms.length - 1]
      const ll = eonetCentroid(g?.coordinates)
      if (!ll) continue
      const [lat, lng] = ll
      out.push({
        kind: 'fire',
        id: `eonet-${e.id}`,
        lat,
        lng,
        brightness: 0,
        confidence: 'EONET tracked',
        satellite: 'NASA EONET',
        frp: Number(g?.magnitudeValue ?? 0),
        acquired: g?.date ?? '',
        daynight: '—',
      })
    }
    return out
  } catch {
    return []
  }
}

function parseCsv(text: string): Record<string, string>[] {
  // Split CRLF-tolerantly: a stray \r would otherwise stick to the last header
  // key (daynight) and value, silently misclassifying every fire as "Day".
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h] = cols[i]))
    return row
  })
}

export async function fetchFires(): Promise<Fire[]> {
  // Always include the keyless EONET baseline; add FIRMS thermal if keyed.
  const [eonet, firms] = await Promise.all([fetchEonetFires(), fetchFirms()])
  // FIRMS first (strongest sorted), then EONET named fires.
  return [...firms, ...eonet].slice(0, 800)
}

async function fetchFirms(): Promise<Fire[]> {
  const key = firmsKey()
  if (!key) return []
  // Global VIIRS NOAA-20, last 1 day.
  const url = `${FIRMS}/api/area/csv/${key}/VIIRS_NOAA20_NRT/world/1`
  try {
    const r = await rawFetch(url, { ms: 12000 })
    if (!r || !r.ok) return []
    const text = await r.text()
    if (!text.includes('latitude')) return []
    const rows = parseCsv(text)
    const out: Fire[] = []
    for (const row of rows) {
      const lat = Number(row.latitude)
      const lng = Number(row.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      out.push({
        kind: 'fire',
        id: `firms-${lat.toFixed(4)},${lng.toFixed(4)},${row.acq_time ?? ''}`,
        lat,
        lng,
        brightness: Number(row.bright_ti4 ?? row.brightness ?? 0),
        confidence: row.confidence ?? '',
        satellite: row.satellite ?? 'VIIRS',
        frp: Number(row.frp ?? 0),
        acquired: `${row.acq_date ?? ''} ${row.acq_time ?? ''}`.trim(),
        daynight: row.daynight === 'N' ? 'Night' : 'Day',
      })
    }
    // Strongest fires first; cap for legibility.
    out.sort((a, b) => b.frp - a.frp)
    return out.slice(0, 600)
  } catch {
    return []
  }
}
