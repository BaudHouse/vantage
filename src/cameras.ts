// Traffic cameras. Two free, key-less sources:
//   • NYC DOT (nyctmc) — ~952 cams whose JPEG endpoint refreshes every 1-2s, so
//     polling it gives a TRULY LIVE feed (marked live=true).
//   • Caltrans CCTV — thousands of California cams, periodic stills (live=false),
//     kept for geographic spread.

import type { Camera } from './layers'
import { rawFetch } from './net'

const DEV = import.meta.env.DEV
const CT = DEV ? '/feeds/caltrans' : 'https://cwwp2.dot.ca.gov'
const NYC = DEV ? '/feeds/nyccams' : 'https://webcams.nyctmc.org'
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
  return Number.isFinite(n) && n !== 0 ? n : null
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
    if (!lat || !lng || c?.isOnline !== 'true') continue
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
  const reqs = DISTRICTS.map((d) =>
    tfetch(`${CT}/data/${d}/cctv/cctvStatus${d.toUpperCase()}.json`),
  )
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
      if (!lat || !lng || !img || img.length < 5) continue
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
    if (!lat || !lng) continue
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

export async function fetchCameras(): Promise<Camera[]> {
  const [nyc, ca, tfl] = await Promise.all([
    fetchNyc(),
    fetchCaltrans(),
    fetchTfl(),
  ])
  // Live NYC cams first, then London (video), then California.
  return [...nyc, ...tfl, ...ca]
}
