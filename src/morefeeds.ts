// Expansion feeds — every additional free / key-less global source, normalized
// to the entity model in layers.ts. All routed through rawFetch so they work in
// dev (Vite proxy) and in the packaged Electron build (main-process fetch).

import { rawFetch } from './net'
import type {
  Hazard,
  Volcano,
  Storm,
  Radiation,
  WxAlert,
  Satellite,
} from './layers'
import type { GeoEvent } from './feeds'

const DEV = import.meta.env.DEV
const B = {
  gdacs: DEV ? '/feeds/gdacs' : 'https://www.gdacs.org',
  usgsvolc: DEV ? '/feeds/usgsvolc' : 'https://volcanoes.usgs.gov',
  nhc: DEV ? '/feeds/nhc' : 'https://www.nhc.noaa.gov',
  emsc: DEV ? '/feeds/emsc' : 'https://www.seismicportal.eu',
  safecast: DEV ? '/feeds/safecast' : 'https://api.safecast.org',
  nws: DEV ? '/feeds/nws' : 'https://api.weather.gov',
  iss: DEV ? '/feeds/iss' : 'https://api.wheretheiss.at',
}

async function getJson(url: string, ms = 11000): Promise<any | null> {
  const r = await rawFetch(url, { ms })
  if (!r || !r.ok) return null
  try {
    return await r.json()
  } catch {
    return null
  }
}

// ---- GDACS: global multi-hazard alerts (floods, cyclones, droughts, …) ------
const GDACS_TYPE: Record<string, string> = {
  EQ: 'Earthquake', TC: 'Tropical Cyclone', FL: 'Flood', DR: 'Drought',
  VO: 'Volcano', WF: 'Wildfire', TS: 'Tsunami',
}

export async function fetchHazards(): Promise<Hazard[]> {
  const j = await getJson(`${B.gdacs}/gdacsapi/api/events/geteventlist/MAP`)
  const feats: any[] = j?.features ?? []
  const out: Hazard[] = []
  for (const f of feats) {
    const c = f?.geometry?.coordinates
    const p = f?.properties ?? {}
    if (!Array.isArray(c) || c.length < 2) continue
    const lng = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      kind: 'hazard',
      id: `gdacs-${p.eventtype}-${p.eventid ?? `${lat},${lng}`}`,
      lat,
      lng,
      title: p.name || p.htmldescription || `${GDACS_TYPE[p.eventtype] ?? p.eventtype} event`,
      hazardType: GDACS_TYPE[p.eventtype] ?? p.eventtype ?? 'Hazard',
      severity: p.alertlevel ?? 'Green',
      level: Number(p.episodealertscore ?? p.alertscore ?? 0),
      country: p.country ?? '',
      url: p.url?.report || p.url?.details || undefined,
      date: p.fromdate ?? '',
    })
  }
  return out.slice(0, 300)
}

// ---- USGS: elevated/active volcanoes ---------------------------------------
export async function fetchVolcanoes(): Promise<Volcano[]> {
  const j = await getJson(
    `${B.usgsvolc}/hans-public/api/volcano/getElevatedVolcanoes`,
  )
  const list: any[] = Array.isArray(j) ? j : (j?.data ?? [])
  const out: Volcano[] = []
  for (const v of list) {
    const lat = Number(v.latitude)
    const lng = Number(v.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      kind: 'volcano',
      id: `volc-${v.vnum ?? v.volcano_name ?? `${lat},${lng}`}`,
      lat,
      lng,
      name: v.volcano_name ?? 'Volcano',
      level: v.alert_level ?? v.color_code ?? 'Elevated',
      color: v.color_code ?? '',
      observatory: v.obs_abbr ?? v.obs_fullname ?? 'USGS',
      region: v.subregion ?? v.region ?? '',
    })
  }
  return out
}

// ---- NOAA NHC: active tropical cyclones ------------------------------------
function nhcCoord(v: any): number {
  // values like "12.3N" / "84.5W"
  if (typeof v === 'number') return v
  const s = String(v ?? '')
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return NaN
  return /[SW]/i.test(s) ? -n : n
}

export async function fetchStorms(): Promise<Storm[]> {
  const j = await getJson(`${B.nhc}/CurrentStorms.json`)
  const list: any[] = j?.activeStorms ?? []
  const out: Storm[] = []
  for (const s of list) {
    const lat = nhcCoord(s.latitudeNumeric ?? s.latitude)
    const lng = nhcCoord(s.longitudeNumeric ?? s.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      kind: 'storm',
      id: `nhc-${s.id ?? s.name}`,
      lat,
      lng,
      name: s.name ?? 'Cyclone',
      classification: s.classification ?? '',
      intensityMph: Number(s.intensity ?? 0),
      pressureMb: Number(s.pressure ?? 0),
      movement: s.movementDir ? `${s.movementDir} @ ${s.movementSpeed ?? '?'} mph` : '',
      basin: s.binNumber?.startsWith?.('AT') ? 'Atlantic' : s.binNumber?.startsWith?.('EP') ? 'E. Pacific' : '',
    })
  }
  return out
}

// ---- Safecast: crowdsourced radiation sensors ------------------------------
export async function fetchRadiation(): Promise<Radiation[]> {
  const j = await getJson(`${B.safecast}/measurements.json?order=captured_at+desc`)
  const list: any[] = Array.isArray(j) ? j : []
  const out: Radiation[] = []
  for (const m of list) {
    const lat = Number(m.latitude)
    const lng = Number(m.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      kind: 'radiation',
      id: `sc-${m.id}`,
      lat,
      lng,
      value: Number(m.value ?? 0),
      unit: m.unit ?? 'cpm',
      location: m.location_name ?? '',
      captured: m.captured_at ?? '',
      device: String(m.device_id ?? ''),
    })
  }
  return out.slice(0, 250)
}

// ---- NWS: active severe/extreme US weather alerts --------------------------
function polyCentroid(geom: any): [number, number] | null {
  if (!geom) return null
  let ring: any[] | null = null
  if (geom.type === 'Polygon') ring = geom.coordinates?.[0]
  else if (geom.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0]
  else if (geom.type === 'Point') {
    const c = geom.coordinates
    return Array.isArray(c) ? [c[1], c[0]] : null
  }
  if (!Array.isArray(ring) || !ring.length) return null
  let sx = 0
  let sy = 0
  for (const p of ring) {
    sx += p[0]
    sy += p[1]
  }
  return [sy / ring.length, sx / ring.length]
}

export async function fetchWxAlerts(): Promise<WxAlert[]> {
  const j = await getJson(`${B.nws}/alerts/active?severity=Severe,Extreme`)
  const feats: any[] = j?.features ?? []
  const out: WxAlert[] = []
  for (const f of feats) {
    const c = polyCentroid(f?.geometry)
    if (!c) continue
    const p = f?.properties ?? {}
    out.push({
      kind: 'alert',
      id: `nws-${p.id ?? f.id}`,
      lat: c[0],
      lng: c[1],
      event: p.event ?? 'Weather alert',
      severity: p.severity ?? '',
      area: p.areaDesc ?? '',
      headline: p.headline ?? '',
      url: undefined,
      expires: p.expires ?? '',
    })
  }
  return out.slice(0, 200)
}

// ---- ISS live position ------------------------------------------------------
export async function fetchSatellites(): Promise<Satellite[]> {
  // wheretheiss is rate-limited (~1 req/s) and can be slow through a proxy.
  const j = await getJson(`${B.iss}/v1/satellites/25544`, 12000)
  if (!j || typeof j.latitude !== 'number') return []
  return [
    {
      kind: 'satellite',
      id: 'iss-25544',
      lat: j.latitude,
      lng: j.longitude,
      name: 'ISS (Zarya)',
      altitude: Math.round(j.altitude ?? 0),
      velocity: Math.round(j.velocity ?? 0),
    },
  ]
}

// ---- EMSC: additional real-time earthquakes (augments USGS) ----------------
export async function fetchEmscQuakes(): Promise<GeoEvent[]> {
  const j = await getJson(
    `${B.emsc}/fdsnws/event/1/query?format=json&limit=120&minmag=2.5`,
  )
  const feats: any[] = j?.features ?? []
  const out: GeoEvent[] = []
  for (const f of feats) {
    const c = f?.geometry?.coordinates
    const p = f?.properties ?? {}
    if (!Array.isArray(c) || c.length < 2) continue
    const mag = Number(p.mag ?? 0)
    out.push({
      id: `emsc-${f.id ?? p.unid}`,
      kind: 'quake',
      lat: Number(c[1]),
      lng: Number(c[0]),
      title: `M${mag.toFixed(1)} · ${p.flynn_region ?? 'earthquake'}`,
      detail: `Magnitude ${mag.toFixed(1)} · ${p.depth ?? '?'} km depth (EMSC)`,
      url: p.url ?? undefined,
      weight: Math.max(0, Math.min(1, (mag - 2.5) / 5)),
      time: p.time ? Date.parse(p.time) : Date.now(),
    })
  }
  return out
}
