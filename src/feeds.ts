// Free OSINT / geophysical feeds — no API keys required. Routed through the
// Vite dev proxy (see vite.config.ts) so the browser never hits a CORS wall.
//
//   conflict  -> GDELT DOC 2.0 (live news, geocoded by source country)
//   quake     -> USGS earthquakes M2.5+ (last day)
//   disaster  -> NASA EONET (satellite-tracked natural events)

import { resolvePlace, type Resolved } from './gazetteer'

export type EventKind = 'conflict' | 'quake' | 'disaster'

export interface GeoEvent {
  id: string
  kind: EventKind
  lat: number
  lng: number
  title: string
  detail: string
  url?: string
  /** 0..1 — drives dot size / glow */
  weight: number
  time: number // epoch ms
  country?: string // set for conflict events, for choropleth aggregation
  count?: number // number of underlying reports (conflict)
  precise?: boolean // conflict located to an actual place (not publisher country)
}

// Natural Earth country polygons (CORS-enabled raw GitHub) for the heatmap.
export const WORLD_GEOJSON =
  'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

// In dev we hit the Vite proxy (dodges CORS). In a packaged Electron build
// there is no proxy, so we call the real origins directly (webSecurity is
// relaxed in electron/main.cjs for these public, read-only APIs).
const DEV = import.meta.env.DEV
const BASE = DEV
  ? { gdelt: '/feeds/gdelt', usgs: '/feeds/usgs', eonet: '/feeds/eonet' }
  : {
      gdelt: 'https://api.gdeltproject.org/api/v2',
      usgs: 'https://earthquake.usgs.gov',
      eonet: 'https://eonet.gsfc.nasa.gov/api/v3',
    }

/** fetch with a hard timeout so one slow/stalled feed can't block the globe. */
async function tfetch(url: string, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Approx country centroids (lat, lng) for GDELT source-country geocoding.
// Keyed by the country names GDELT returns in `sourcecountry`.
const CENTROID: Record<string, [number, number]> = {
  Afghanistan: [33.9, 67.7], Albania: [41.2, 20.2], Algeria: [28.0, 1.7],
  Argentina: [-38.4, -63.6], Armenia: [40.1, 45.0], Australia: [-25.3, 133.8],
  Austria: [47.5, 14.6], Azerbaijan: [40.1, 47.6], Bangladesh: [23.7, 90.4],
  Belarus: [53.7, 27.9], Belgium: [50.5, 4.5], Bolivia: [-16.3, -63.6],
  Brazil: [-14.2, -51.9], Bulgaria: [42.7, 25.5], Burkina: [12.2, -1.6],
  Cambodia: [12.6, 104.9], Cameroon: [7.4, 12.4], Canada: [56.1, -106.3],
  Chad: [15.5, 18.7], Chile: [-35.7, -71.5], China: [35.9, 104.2],
  Colombia: [4.6, -74.3], Congo: [-0.2, 15.8], Croatia: [45.1, 15.2],
  Cuba: [21.5, -77.8], Czech: [49.8, 15.5], Denmark: [56.3, 9.5],
  Ecuador: [-1.8, -78.2], Egypt: [26.8, 30.8], Estonia: [58.6, 25.0],
  Ethiopia: [9.1, 40.5], Finland: [61.9, 25.7], France: [46.2, 2.2],
  Georgia: [42.3, 43.4], Germany: [51.2, 10.5], Ghana: [7.9, -1.0],
  Greece: [39.1, 21.8], Guatemala: [15.8, -90.2], Haiti: [19.0, -72.3],
  Honduras: [15.2, -86.2], Hungary: [47.2, 19.5], India: [20.6, 79.0],
  Indonesia: [-0.8, 113.9], Iran: [32.4, 53.7], Iraq: [33.2, 43.7],
  Ireland: [53.4, -8.2], Israel: [31.0, 34.9], Italy: [41.9, 12.6],
  'Ivory Coast': [7.5, -5.5], Jamaica: [18.1, -77.3], Japan: [36.2, 138.3],
  Jordan: [30.6, 36.2], Kazakhstan: [48.0, 66.9], Kenya: [-0.0, 37.9],
  'North Korea': [40.3, 127.5], 'South Korea': [35.9, 127.8], Kosovo: [42.6, 20.9],
  Kuwait: [29.3, 47.5], Kyrgyzstan: [41.2, 74.8], Laos: [19.9, 102.5],
  Latvia: [56.9, 24.6], Lebanon: [33.9, 35.9], Liberia: [6.4, -9.4],
  Libya: [26.3, 17.2], Lithuania: [55.2, 23.9], Madagascar: [-18.8, 47.0],
  Malaysia: [4.2, 101.9], Mali: [17.6, -4.0], Mexico: [23.6, -102.6],
  Moldova: [47.4, 28.4], Mongolia: [46.9, 103.8], Morocco: [31.8, -7.1],
  Mozambique: [-18.7, 35.5], Myanmar: [21.9, 95.9], Nepal: [28.4, 84.1],
  Netherlands: [52.1, 5.3], 'New Zealand': [-40.9, 174.9], Nicaragua: [12.9, -85.2],
  Niger: [17.6, 8.1], Nigeria: [9.1, 8.7], Norway: [60.5, 8.5],
  Pakistan: [30.4, 69.3], Panama: [8.5, -80.8], 'Papua New Guinea': [-6.3, 143.9],
  Paraguay: [-23.4, -58.4], Peru: [-9.2, -75.0], Philippines: [12.9, 121.8],
  Poland: [51.9, 19.1], Portugal: [39.4, -8.2], Qatar: [25.4, 51.2],
  Romania: [45.9, 25.0], Russia: [61.5, 105.3], Rwanda: [-1.9, 29.9],
  'Saudi Arabia': [23.9, 45.1], Senegal: [14.5, -14.5], Serbia: [44.0, 21.0],
  Singapore: [1.4, 103.8], Slovakia: [48.7, 19.7], Somalia: [5.2, 46.2],
  'South Africa': [-30.6, 22.9], 'South Sudan': [7.0, 30.0], Spain: [40.5, -3.7],
  'Sri Lanka': [7.9, 80.8], Sudan: [12.9, 30.2], Sweden: [60.1, 18.6],
  Switzerland: [46.8, 8.2], Syria: [34.8, 38.0], Taiwan: [23.7, 121.0],
  Tajikistan: [38.9, 71.3], Tanzania: [-6.4, 34.9], Thailand: [15.9, 101.0],
  Tunisia: [33.9, 9.6], Turkey: [39.0, 35.2], Uganda: [1.4, 32.3],
  Ukraine: [48.4, 31.2], 'United Arab Emirates': [23.4, 53.8],
  'United Kingdom': [55.4, -3.4], 'United States': [37.1, -95.7],
  Uruguay: [-32.5, -55.8], Uzbekistan: [41.4, 64.6], Venezuela: [6.4, -66.6],
  Vietnam: [14.1, 108.3], Yemen: [15.6, 48.5], Zambia: [-13.1, 27.8],
  Zimbabwe: [-19.0, 29.2],
}

function jitter(v: number, amt = 3) {
  return v + (Math.random() - 0.5) * amt
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Last good conflict snapshot, kept in-memory and mirrored to localStorage so a
// transient GDELT 429 / rate-limit notice never blanks the map back to zero.
const CONFLICT_CACHE_KEY = 'vantage.conflict.v1'
let conflictCache: GeoEvent[] = (() => {
  try {
    const raw = localStorage.getItem(CONFLICT_CACHE_KEY)
    return raw ? (JSON.parse(raw) as GeoEvent[]) : []
  } catch {
    return []
  }
})()

function saveConflictCache(events: GeoEvent[]) {
  conflictCache = events
  try {
    localStorage.setItem(CONFLICT_CACHE_KEY, JSON.stringify(events))
  } catch {
    /* quota / private mode — in-memory cache still holds */
  }
}

/** One GDELT DOC attempt. Returns null on rate-limit / transient failure. */
async function gdeltAttempt(url: string): Promise<GeoEvent[] | null> {
  const r = await tfetch(url)
  if (!r) return null
  if (r.status === 429) return null
  if (!r.ok) return null
  const text = await r.text()
  // GDELT serves plain-text rate-limit notices on a 200; only JSON is valid.
  if (!text.trim().startsWith('{')) return null
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    return null
  }
  const arts: any[] = j?.articles ?? []
  // Resolve each story to where it's ACTUALLY happening (from the headline),
  // not where it was published, then cluster by that place.
  const centroidLookup = (c: string): [number, number] | null =>
    CENTROID[c] ?? null
  const byPlace = new Map<string, { list: any[]; r: Resolved }>()
  for (const a of arts) {
    const res = resolvePlace(a?.title ?? '', a?.sourcecountry ?? '', centroidLookup)
    if (!res) continue
    const key = res.place
    const slot = byPlace.get(key)
    if (slot) slot.list.push(a)
    else byPlace.set(key, { list: [a], r: res })
  }
  const out: GeoEvent[] = []
  for (const [place, { list, r }] of byPlace) {
    const top = list[0]
    const spread = r.precise ? 1.2 : 3
    out.push({
      id: `gdelt-${place}`,
      kind: 'conflict',
      lat: jitter(r.lat, spread),
      lng: jitter(r.lng, spread),
      title: top?.title ?? `${place}: conflict coverage`,
      detail: `${list.length} report(s) · ${place}${r.precise ? '' : ' (source country)'}`,
      url: top?.url,
      weight: clamp01(Math.log10(list.length + 1) / 1.8),
      time: Date.now(),
      country: r.country,
      count: list.length,
      precise: r.precise,
    })
  }
  return out
}

/**
 * GDELT DOC 2.0 — live news articles matching conflict terms. No key.
 * Geocoded approximately to the article's source country (publisher location).
 * Retries through GDELT's aggressive rate-limiting and falls back to the last
 * good snapshot so the conflict layer stays populated between successful pulls.
 */
export async function fetchConflict(): Promise<GeoEvent[]> {
  const query = encodeURIComponent(
    '(airstrike OR shelling OR clashes OR offensive OR militants OR ceasefire OR drone OR rocket OR insurgents) sourcelang:eng',
  )
  const url = `${BASE.gdelt}/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=200&timespan=1d&sort=datedesc`
  // Up to 3 tries with backoff to ride out GDELT's ~5s-per-request throttle.
  for (let i = 0; i < 3; i++) {
    const res = await gdeltAttempt(url)
    if (res && res.length) {
      saveConflictCache(res)
      return res
    }
    if (i < 2) await sleep(1500 * (i + 1))
  }
  // All attempts rate-limited / empty: keep showing the last good snapshot.
  return conflictCache
}

/** USGS — earthquakes M2.5+ in the past day. No key. GeoJSON. */
export async function fetchQuakes(): Promise<GeoEvent[]> {
  const url = `${BASE.usgs}/earthquakes/feed/v1.0/summary/2.5_day.geojson`
  try {
    const r = await tfetch(url)
    if (!r || !r.ok) return []
    const j = await r.json()
    const feats: any[] = j?.features ?? []
    return feats
      .filter((f) => f?.geometry?.coordinates?.length >= 2)
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates
        const mag = Number(f.properties?.mag ?? 0)
        return {
          id: `usgs-${f.id}`,
          kind: 'quake' as const,
          lat,
          lng,
          title: f.properties?.title ?? `M${mag} quake`,
          detail: `Magnitude ${mag.toFixed(1)}`,
          url: f.properties?.url,
          weight: clamp01((mag - 2.5) / 5),
          time: Number(f.properties?.time ?? Date.now()),
        }
      })
  } catch {
    return []
  }
}

/** NASA EONET — open satellite-tracked natural events (fires, storms, volcanoes). No key. */
export async function fetchDisasters(): Promise<GeoEvent[]> {
  const url = `${BASE.eonet}/events?status=open&limit=200`
  try {
    const r = await tfetch(url)
    if (!r || !r.ok) return []
    const j = await r.json()
    const evs: any[] = j?.events ?? []
    const out: GeoEvent[] = []
    for (const e of evs) {
      const geoms: any[] = e?.geometry ?? []
      const g = geoms[geoms.length - 1] // most recent position
      const coords = g?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) continue
      const [lng, lat] = coords
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const cat = e?.categories?.[0]?.title ?? 'Event'
      out.push({
        id: `eonet-${e.id}`,
        kind: 'disaster',
        lat,
        lng,
        title: e?.title ?? cat,
        detail: cat,
        url: e?.sources?.[0]?.url ?? e?.link,
        weight: 0.6,
        time: g?.date ? Date.parse(g.date) : Date.now(),
      })
    }
    return out
  } catch {
    return []
  }
}

export async function fetchAll(): Promise<GeoEvent[]> {
  const results = await Promise.allSettled([
    fetchConflict(),
    fetchQuakes(),
    fetchDisasters(),
  ])
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

export const KIND_COLOR: Record<EventKind, string> = {
  conflict: '#ff4d4d',
  quake: '#ffb000',
  disaster: '#4db8ff',
}

// GDELT country name -> Natural Earth ADMIN name (only where they differ).
const NE_ALIAS: Record<string, string> = {
  'United States': 'United States of America',
  Serbia: 'Republic of Serbia',
  Tanzania: 'United Republic of Tanzania',
  Congo: 'Democratic Republic of the Congo',
  Czech: 'Czechia',
  'North Korea': 'North Korea',
  'South Korea': 'South Korea',
}

/**
 * Conflict intensity by Natural Earth country name (for the choropleth).
 * Only PRECISELY located events count — a US outlet covering Kyiv must not
 * paint the United States red.
 */
export function conflictByCountry(events: GeoEvent[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of events) {
    if (e.kind !== 'conflict' || !e.country || !e.precise) continue
    const name = NE_ALIAS[e.country] ?? e.country
    out[name] = (out[name] ?? 0) + (e.count ?? 1)
  }
  return out
}

export interface Stats {
  active: number // active conflict hotspots
  tensions: number // total tracked events
  pulse24h: number
}

export function deriveStats(events: GeoEvent[]): Stats {
  const conflict = events.filter((e) => e.kind === 'conflict')
  // Count distinct hotspot countries by intensity (matches conflictly's framing):
  //   active  = high-intensity flashpoints (>= 3 reports/24h)
  //   tensions = lower-intensity watch zones (1-2 reports/24h)
  return {
    active: conflict.filter((e) => (e.count ?? 0) >= 3).length,
    tensions: conflict.filter((e) => (e.count ?? 0) >= 1 && (e.count ?? 0) < 3)
      .length,
    pulse24h: events.length,
  }
}
