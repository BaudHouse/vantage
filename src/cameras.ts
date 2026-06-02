// Traffic cameras. Two free, key-less sources:
//   • NYC DOT (nyctmc) — ~952 cams whose JPEG endpoint refreshes every 1-2s, so
//     polling it gives a TRULY LIVE feed (marked live=true).
//   • Caltrans CCTV — thousands of California cams, periodic stills (live=false),
//     kept for geographic spread.

import type { Camera } from './layers'

const DEV = import.meta.env.DEV
const CT = DEV ? '/feeds/caltrans' : 'https://cwwp2.dot.ca.gov'
const NYC = DEV ? '/feeds/nyccams' : 'https://webcams.nyctmc.org'
// Images load directly (no CORS needed for <img>); always hit the real host.
const NYC_IMG = 'https://webcams.nyctmc.org'

async function tfetch(url: string, ms = 9000): Promise<any | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
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

export async function fetchCameras(): Promise<Camera[]> {
  const [nyc, ca] = await Promise.all([fetchNyc(), fetchCaltrans()])
  // Live NYC cams first so they lead the gallery.
  return [...nyc, ...ca]
}
