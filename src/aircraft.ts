// Live aircraft via adsb.lol (ADS-B aggregator) — free, no key, no OpenSky-style
// throttling. We pull the global military feed (always interesting) plus a few
// dense civilian metro boxes, dedupe, and normalize to the Aircraft entity.

import type { Aircraft } from './layers'
import { rawFetch } from './net'

const DEV = import.meta.env.DEV
const ADSB = DEV ? '/feeds/adsb' : 'https://api.adsb.lol'

// ADS-B emitter category -> readable class.
const CATEGORY: Record<string, string> = {
  A0: 'No info', A1: 'Light', A2: 'Small', A3: 'Large', A4: 'High-vortex large',
  A5: 'Heavy', A6: 'High-perf', A7: 'Rotorcraft',
  B1: 'Glider', B2: 'Balloon', B3: 'Parachutist', B4: 'Ultralight',
  B6: 'UAV/Drone', B7: 'Spacecraft',
  C0: 'Surface', C1: 'Surface vehicle', C2: 'Surface vehicle', C3: 'Obstacle',
}

// Busy metro boxes (lat, lon, radius nm) for civilian density.
const BOXES: [number, number, number][] = [
  [51.5, -0.1, 120], // London
  [40.7, -74.0, 120], // New York
  [50.1, 8.7, 120], // Frankfurt
  [25.3, 55.4, 120], // Dubai
  [35.7, 139.7, 120], // Tokyo
  [1.35, 103.8, 120], // Singapore
]

async function tfetch(url: string, ms = 9000): Promise<any | null> {
  const r = await rawFetch(url, { ms })
  if (!r || !r.ok) return null
  try {
    return await r.json()
  } catch {
    return null
  }
}

function emergencyText(v: any): string {
  const e = (v ?? '').toString().toLowerCase()
  return e && e !== 'none' ? e : ''
}

function mapAc(a: any, forceMil: boolean): Aircraft | null {
  const lat = a?.lat
  const lng = a?.lon
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const dbFlags = Number(a?.dbFlags ?? 0)
  const military = forceMil || (dbFlags & 1) === 1
  const altRaw = a?.alt_baro
  const altitude = altRaw === 'ground' ? 0 : Number(altRaw ?? 0)
  return {
    kind: 'aircraft',
    id: a?.hex ?? `${lat},${lng}`,
    lat,
    lng,
    callsign: (a?.flight ?? '').toString().trim(),
    registration: (a?.r ?? '').toString().trim(),
    acType: (a?.t ?? '').toString().trim(),
    altitude,
    speed: Number(a?.gs ?? 0),
    heading: Number(a?.track ?? a?.true_heading ?? 0),
    vertRate: Number(a?.baro_rate ?? a?.geom_rate ?? 0),
    squawk: (a?.squawk ?? '').toString(),
    category: CATEGORY[a?.category] ?? (a?.category ?? ''),
    military,
    emergency: emergencyText(a?.emergency),
    seen: Number(a?.seen ?? 0),
  }
}

export async function fetchAircraft(): Promise<Aircraft[]> {
  const reqs: Promise<any | null>[] = [tfetch(`${ADSB}/v2/mil`)]
  for (const [lat, lon, dist] of BOXES) {
    reqs.push(tfetch(`${ADSB}/v2/lat/${lat}/lon/${lon}/dist/${dist}`))
  }
  const results = await Promise.allSettled(reqs)

  const byId = new Map<string, Aircraft>()
  results.forEach((res, idx) => {
    if (res.status !== 'fulfilled' || !res.value) return
    const forceMil = idx === 0 // first request is the /mil feed
    for (const a of res.value.ac ?? []) {
      const ac = mapAc(a, forceMil)
      if (!ac) continue
      // Military feed wins on dedupe so the mil flag isn't lost.
      const prev = byId.get(ac.id)
      if (!prev || (ac.military && !prev.military)) byId.set(ac.id, ac)
    }
  })

  const all = [...byId.values()]
  // Military and emergencies first, then by altitude; cap for legibility.
  all.sort((a, b) => {
    const am = Number(!!a.emergency) * 2 + Number(a.military)
    const bm = Number(!!b.emergency) * 2 + Number(b.military)
    return bm - am
  })
  return all.slice(0, 500)
}
