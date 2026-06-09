// Unified entity model for the map. Every live layer normalizes its records to
// one of these shapes so the globe (icons), the dossier (detail panel) and the
// Operator (LLM context) can all reason over a single typed union.
//
// GeoEvent (conflict / quake / disaster) lives in feeds.ts and is folded in via
// its `kind` discriminator; the richer OSINT layers below add their own `kind`.

import type { GeoEvent } from './feeds'

export interface Aircraft {
  kind: 'aircraft'
  id: string
  lat: number
  lng: number
  callsign: string
  registration: string
  acType: string // ICAO type code, e.g. F16, B738
  altitude: number // feet
  speed: number // knots ground speed
  heading: number // degrees true track
  vertRate: number // ft/min
  squawk: string
  category: string // ADS-B emitter category
  military: boolean
  emergency: string // '', 'general', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'downed'
  seen: number // seconds since last message
}

export interface Ship {
  kind: 'ship'
  id: string // MMSI
  lat: number
  lng: number
  name: string
  shipType: string
  flag: string
  speed: number // knots
  heading: number
  destination: string
  navStatus: string
}

export interface Camera {
  kind: 'camera'
  id: string
  lat: number
  lng: number
  name: string
  road: string
  region: string // searchable: state / metro / district, e.g. "New York · Manhattan"
  image: string // JPEG URL (cache-bust to refresh)
  video?: string // optional short MP4 clip (e.g. TfL JamCams) — a real moving feed
  source: string
  live: boolean // true = updates every ~1-2s (poll fast); false = periodic still
}

export interface Fire {
  kind: 'fire'
  id: string
  lat: number
  lng: number
  brightness: number // Kelvin (brightness temperature)
  confidence: string // low/nominal/high or 0-100
  satellite: string
  frp: number // fire radiative power (MW)
  acquired: string // ISO-ish timestamp
  daynight: string
}

// ---- expansion entities (all free / key-less sources) ----------------------

export interface Hazard {
  kind: 'hazard'
  id: string
  lat: number
  lng: number
  title: string
  hazardType: string // Flood / Tropical Cyclone / Drought / Earthquake / Volcano
  severity: string // GDACS alert level: Green / Orange / Red
  level: number
  country: string
  url?: string
  date: string
}

export interface Volcano {
  kind: 'volcano'
  id: string
  lat: number
  lng: number
  name: string
  level: string // alert level
  color: string // aviation color code
  observatory: string
  region: string
}

export interface Storm {
  kind: 'storm'
  id: string
  lat: number
  lng: number
  name: string
  classification: string // TD / TS / HU / ...
  intensityMph: number
  pressureMb: number
  movement: string
  basin: string
}

export interface Radiation {
  kind: 'radiation'
  id: string
  lat: number
  lng: number
  value: number
  unit: string // cpm / usv
  location: string
  captured: string
  device: string
}

export interface WxAlert {
  kind: 'alert'
  id: string
  lat: number
  lng: number
  event: string
  severity: string
  area: string
  headline: string
  url?: string
  expires: string
}

export interface Satellite {
  kind: 'satellite'
  id: string
  lat: number
  lng: number
  name: string
  altitude: number // km
  velocity: number // km/h
}

export interface AirQuality {
  kind: 'airquality'
  id: string
  lat: number
  lng: number
  location: string
  aqi: number // US EPA Air Quality Index
  updated: string
}

export type Entity =
  | GeoEvent
  | Aircraft
  | Ship
  | Camera
  | Fire
  | Hazard
  | Volcano
  | Storm
  | Radiation
  | WxAlert
  | Satellite
  | AirQuality

export type LayerId =
  | 'conflict'
  | 'quake'
  | 'disaster'
  | 'aircraft'
  | 'fire'
  | 'ship'
  | 'camera'
  | 'weather'
  | 'hazard'
  | 'volcano'
  | 'storm'
  | 'alert'
  | 'radiation'
  | 'satellite'
  | 'airquality'

export type KeyEnv =
  | 'VITE_FIRMS_KEY'
  | 'VITE_AISSTREAM_KEY'
  | 'VITE_WAQI_KEY'
  | 'VITE_WINDY_KEY'

export interface LayerMeta {
  id: LayerId
  label: string
  glyph: string
  color: string
  /** layers off by default to keep the first paint light */
  defaultOn: boolean
  /** needs a free API key in .env */
  needsKey?: KeyEnv
}

export const LAYERS: LayerMeta[] = [
  { id: 'conflict', label: 'Conflict', glyph: '⚔', color: '#ff4d4d', defaultOn: true },
  { id: 'quake', label: 'Seismic', glyph: '◎', color: '#ffb000', defaultOn: true },
  { id: 'hazard', label: 'Hazard Alerts', glyph: '⚠', color: '#ff9500', defaultOn: true },
  { id: 'disaster', label: 'Disasters', glyph: '✷', color: '#4db8ff', defaultOn: true },
  { id: 'aircraft', label: 'Aircraft', glyph: '✈', color: '#e8eefc', defaultOn: true },
  { id: 'storm', label: 'Cyclones', glyph: '🌀', color: '#4dd0e1', defaultOn: true },
  { id: 'volcano', label: 'Volcanoes', glyph: '🌋', color: '#ff5722', defaultOn: false },
  { id: 'fire', label: 'Wildfires', glyph: '🔥', color: '#ff7a1a', defaultOn: false },
  { id: 'alert', label: 'Wx Alerts (US)', glyph: '🚨', color: '#ffd24d', defaultOn: false },
  { id: 'satellite', label: 'Satellites', glyph: '🛰', color: '#9fe0ff', defaultOn: false },
  { id: 'radiation', label: 'Radiation', glyph: '☢', color: '#cddc39', defaultOn: false },
  { id: 'airquality', label: 'Air Quality', glyph: '🫁', color: '#7e57c2', defaultOn: false, needsKey: 'VITE_WAQI_KEY' },
  { id: 'ship', label: 'Vessels', glyph: '⚓', color: '#3ddc97', defaultOn: false, needsKey: 'VITE_AISSTREAM_KEY' },
  { id: 'camera', label: 'Traffic + Global Cams', glyph: '📷', color: '#c08bff', defaultOn: false },
  { id: 'weather', label: 'Weather Radar', glyph: '🌧', color: '#5fd0e0', defaultOn: false },
]

export const ENTITY_GLYPH: Record<string, string> = {
  conflict: '⚔', quake: '◎', disaster: '✷', aircraft: '✈', ship: '⚓',
  camera: '📷', fire: '🔥', hazard: '⚠', volcano: '🌋', storm: '🌀',
  radiation: '☢', alert: '🚨', satellite: '🛰', airquality: '🫁',
}

export const ENTITY_COLOR: Record<string, string> = {
  conflict: '#ff4d4d', quake: '#ffb000', disaster: '#4db8ff', aircraft: '#e8eefc',
  ship: '#3ddc97', camera: '#c08bff', fire: '#ff7a1a', hazard: '#ff9500',
  volcano: '#ff5722', storm: '#4dd0e1', radiation: '#cddc39', alert: '#ffd24d',
  satellite: '#9fe0ff', airquality: '#7e57c2',
}

/** A short human label for any entity (ticker, tooltip, dossier title). */
export function entityTitle(e: Entity): string {
  switch (e.kind) {
    case 'aircraft':
      return e.callsign || e.registration || e.acType || 'Aircraft'
    case 'ship':
      return e.name || `MMSI ${e.id}`
    case 'camera':
      return e.name || 'Traffic camera'
    case 'fire':
      return `Thermal anomaly · ${e.satellite}`
    case 'hazard':
      return e.title
    case 'volcano':
      return `${e.name} volcano`
    case 'storm':
      return e.name
    case 'radiation':
      return `${e.value} ${e.unit} · ${e.location || 'sensor'}`
    case 'alert':
      return e.event
    case 'satellite':
      return e.name
    case 'airquality':
      return `AQI ${e.aqi} · ${e.location || 'station'}`
    case 'conflict':
    case 'quake':
    case 'disaster':
      return e.title
  }
}
