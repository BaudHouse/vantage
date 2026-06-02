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
  image: string // JPEG URL (cache-bust to refresh)
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

export type Entity = GeoEvent | Aircraft | Ship | Camera | Fire

export type LayerId =
  | 'conflict'
  | 'quake'
  | 'disaster'
  | 'aircraft'
  | 'ship'
  | 'camera'
  | 'fire'
  | 'weather'

export interface LayerMeta {
  id: LayerId
  label: string
  glyph: string
  color: string
  /** layers off by default to keep the first paint light */
  defaultOn: boolean
  /** needs a free API key in .env */
  needsKey?: 'VITE_FIRMS_KEY' | 'VITE_AISSTREAM_KEY'
}

export const LAYERS: LayerMeta[] = [
  { id: 'conflict', label: 'Conflict', glyph: '⚔', color: '#ff4d4d', defaultOn: true },
  { id: 'quake', label: 'Seismic', glyph: '◎', color: '#ffb000', defaultOn: true },
  { id: 'disaster', label: 'Disasters', glyph: '✷', color: '#4db8ff', defaultOn: true },
  { id: 'aircraft', label: 'Aircraft', glyph: '✈', color: '#e8eefc', defaultOn: true },
  { id: 'fire', label: 'Wildfires', glyph: '🔥', color: '#ff7a1a', defaultOn: false },
  { id: 'ship', label: 'Vessels', glyph: '⚓', color: '#3ddc97', defaultOn: false, needsKey: 'VITE_AISSTREAM_KEY' },
  { id: 'camera', label: 'Traffic Cams', glyph: '📷', color: '#c08bff', defaultOn: false },
  { id: 'weather', label: 'Weather Radar', glyph: '🌧', color: '#5fd0e0', defaultOn: false },
]

export const ENTITY_GLYPH: Record<string, string> = {
  conflict: '⚔',
  quake: '◎',
  disaster: '✷',
  aircraft: '✈',
  ship: '⚓',
  camera: '📷',
  fire: '🔥',
}

export const ENTITY_COLOR: Record<string, string> = {
  conflict: '#ff4d4d',
  quake: '#ffb000',
  disaster: '#4db8ff',
  aircraft: '#e8eefc',
  ship: '#3ddc97',
  camera: '#c08bff',
  fire: '#ff7a1a',
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
    default:
      return e.title
  }
}
