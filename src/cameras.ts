// Traffic cameras. Two free, key-less sources:
//   • NYC DOT (nyctmc) — ~952 cams whose JPEG endpoint refreshes every 1-2s, so
//     polling it gives a TRULY LIVE feed (marked live=true).
//   • Caltrans CCTV — thousands of California cams, periodic stills (live=false),
//     kept for geographic spread.

import type { Camera } from './layers'
import { getKey, rawFetch } from './net'

const DEV = import.meta.env.DEV
const CT = DEV ? '/feeds/caltrans' : 'https://cwwp2.dot.ca.gov'
const NYC = DEV ? '/feeds/nyccams' : 'https://webcams.nyctmc.org'
const WINDY = DEV ? '/feeds/windy' : 'https://api.windy.com'
const TFL = DEV ? '/feeds/tfl' : 'https://api.tfl.gov.uk'
// Images/video load directly (no CORS needed for <img>/<video>).
const NYC_IMG = 'https://webcams.nyctmc.org'

async function tfetch(url: string, ms = 9000): Promise<any | null> {
  const r = await rawFetch(url, { ms })
  if (!r || !r.ok) return null
  try {
    return await r.json()
  } catch {
    return null
  }
}

function num(v: any): number | null {
  const n = Number(v)
  // Accept 0 — London (TfL) cameras sit on the prime meridian (lng ≈ 0) and
  // equatorial cams have lat ≈ 0. Only non-finite values are invalid here.
  return Number.isFinite(n) ? n : null
}

/** NYC DOT — truly live (1-2s refresh) JPEG cameras. */
async function fetchNyc(limit = 400): Promise<Camera[]> {
  const list = await tfetch(`${NYC}/api/cameras/`)
  if (!Array.isArray(list)) return []
  const out: Camera[] = []
  for (const c of list) {
    if (out.length >= limit) break
    const lat = num(c?.latitude)
    const lng = num(c?.longitude)
    if (lat == null || lng == null || c?.isOnline !== 'true') continue
    out.push({
      kind: 'camera',
      id: `nyc-${c.id}`,
      lat,
      lng,
      name: c?.name ?? 'NYC camera',
      road: c?.area ?? 'New York City',
      region: `New York · NYC${c?.area ? ` · ${c.area}` : ''}`,
      image: `${NYC_IMG}/api/cameras/${c.id}/image`,
      source: 'NYC DOT · live',
      live: true,
    })
  }
  return out
}

const DISTRICTS = ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd11', 'd12']
const CA_REGION: Record<string, string> = {
  d2: 'Redding / North State',
  d3: 'Sacramento',
  d4: 'San Francisco Bay Area',
  d5: 'Central Coast',
  d6: 'Fresno / Central Valley',
  d7: 'Los Angeles',
  d8: 'San Bernardino / Inland Empire',
  d11: 'San Diego',
  d12: 'Orange County',
}

/** Caltrans — periodic stills, broad California coverage. */
async function fetchCaltrans(perDistrict = 40): Promise<Camera[]> {
  const reqs = DISTRICTS.map((d) => {
    // The CCTV JSON FILENAME needs a zero-padded two-digit district (D02..D08);
    // single-digit names (cctvStatusD2.json) 500. The /data/${d}/ path segment
    // stays lowercase + unpadded. Without this, 7 of 9 districts (incl. LA d7,
    // SF Bay d4) silently returned zero cameras.
    const n = d.slice(1).padStart(2, '0')
    return tfetch(`${CT}/data/${d}/cctv/cctvStatusD${n}.json`)
  })
  const results = await Promise.allSettled(reqs)
  const out: Camera[] = []
  results.forEach((res, idx) => {
    if (res.status !== 'fulfilled' || !res.value) return
    const region = `California · ${CA_REGION[DISTRICTS[idx]] ?? DISTRICTS[idx]}`
    const list: any[] = res.value.data ?? []
    let taken = 0
    for (const row of list) {
      if (taken >= perDistrict) break
      const c = row?.cctv
      const loc = c?.location
      const img = c?.imageData?.static?.currentImageURL
      const lat = num(loc?.latitude)
      const lng = num(loc?.longitude)
      if (lat == null || lng == null || !img || img.length < 5) continue
      out.push({
        kind: 'camera',
        id: `ct-${c?.index ?? `${lat},${lng}`}`,
        lat,
        lng,
        name: loc?.locationName ?? 'Traffic camera',
        road: loc?.route ?? loc?.nearbyPlace ?? '',
        region,
        image: img,
        source: 'Caltrans',
        live: false,
      })
      taken++
    }
  })
  return out
}

/** Transport for London JamCams — JPEG still + short MP4 clip (a real feed). */
async function fetchTfl(limit = 400): Promise<Camera[]> {
  const list = await tfetch(`${TFL}/Place/Type/JamCam`)
  if (!Array.isArray(list)) return []
  const out: Camera[] = []
  for (const c of list) {
    if (out.length >= limit) break
    const lat = num(c?.lat)
    const lng = num(c?.lon)
    if (lat == null || lng == null) continue
    const props: any[] = c?.additionalProperties ?? []
    const get = (k: string) => props.find((p) => p?.key === k)?.value
    const img = get('imageUrl')
    const vid = get('videoUrl')
    const available = (get('available') ?? 'true') !== 'false'
    if (!img || !available) continue
    out.push({
      kind: 'camera',
      id: `tfl-${c.id}`,
      lat,
      lng,
      name: c?.commonName ?? 'London camera',
      road: (c?.commonName ?? '').split(' ')[0] ?? '',
      region: 'London · UK',
      image: img,
      video: vid || undefined,
      source: 'TfL JamCam',
      live: false,
    })
  }
  return out
}

/** Windy global webcams (free key) — worldwide coverage, searchable by region. */
export function windyEnabled(): boolean {
  return !!getKey('VITE_WINDY_KEY')
}

// Windy's free tier caps `limit` at 50 per request, so we paginate. The cam
// LIST is static, so cache it for 30 min to stay well within the free quota
// (the JPEG images themselves still refresh live in the gallery/dossier).
let windyCache: Camera[] = []
let windyAt = 0
const WINDY_PAGES = 4 // 4 x 50 = 200 global webcams

async function fetchWindy(): Promise<Camera[]> {
  const key = getKey('VITE_WINDY_KEY')
  if (!key) return []
  if (Date.now() - windyAt < 30 * 60_000 && windyCache.length) return windyCache
  const headers = { 'x-windy-api-key': key }
  const reqs = Array.from({ length: WINDY_PAGES }, (_, i) =>
    rawFetch(
      `${WINDY}/webcams/api/v3/webcams?limit=50&offset=${i * 50}&include=location,images`,
      { ms: 10000, headers },
    ),
  )
  const out: Camera[] = []
  const seen = new Set<string>()
  for (const p of await Promise.allSettled(reqs)) {
    if (p.status !== 'fulfilled' || !p.value || !p.value.ok) continue
    let j: any
    try {
      j = await p.value.json()
    } catch {
      continue
    }
    for (const w of j?.webcams ?? []) {
      const lat = Number(w?.location?.latitude)
      const lng = Number(w?.location?.longitude)
      const img = w?.images?.current?.preview || w?.images?.daylight?.preview
      const id = `windy-${w.webcamId}`
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !img || seen.has(id)) continue
      seen.add(id)
      const country = w?.location?.country ?? ''
      const city = w?.location?.city ?? ''
      out.push({
        kind: 'camera',
        id,
        lat,
        lng,
        name: w.title ?? city ?? 'Webcam',
        road: city,
        region: [country, city].filter(Boolean).join(' · ') || 'Global',
        image: img,
        source: 'Windy',
        live: false,
      })
    }
  }
  if (out.length) {
    windyCache = out
    windyAt = Date.now()
  }
  return out
}

export async function fetchCameras(): Promise<Camera[]> {
  const [nyc, ca, tfl, windy] = await Promise.all([
    fetchNyc(),
    fetchCaltrans(),
    fetchTfl(),
    fetchWindy(),
  ])
  // Live NYC cams first, then London (video), global Windy, then California.
  return [...nyc, ...tfl, ...windy, ...ca]
}
