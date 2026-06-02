import { useEffect, useState } from 'react'
import { ENTITY_COLOR, ENTITY_GLYPH, entityTitle, type Entity } from '../layers'
import type { Aircraft, Ship, Camera, Fire } from '../layers'
import type { GeoEvent } from '../feeds'
import { safeUrl } from '../safe'

interface Props {
  entity: Entity | null
  onClose: () => void
  onAsk: (e: Entity) => void
}

interface Row {
  k: string
  v: string
}

function compass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return `${Math.round(deg)}° ${dirs[Math.round(((deg % 360) / 45)) % 8]}`
}

function aircraftRows(a: Aircraft): Row[] {
  return [
    { k: 'Callsign', v: a.callsign || '—' },
    { k: 'Registration', v: a.registration || '—' },
    { k: 'Type', v: a.acType || '—' },
    { k: 'Class', v: a.category || '—' },
    { k: 'Altitude', v: a.altitude ? `${a.altitude.toLocaleString()} ft` : 'Ground' },
    { k: 'Ground speed', v: a.speed ? `${Math.round(a.speed)} kt` : '—' },
    { k: 'Heading', v: a.heading ? compass(a.heading) : '—' },
    {
      k: 'Vertical',
      v: a.vertRate
        ? `${a.vertRate > 0 ? '▲ climbing' : '▼ descending'} ${Math.abs(a.vertRate)} ft/min`
        : 'Level',
    },
    { k: 'Squawk', v: a.squawk || '—' },
    { k: 'ICAO24', v: a.id.toUpperCase() },
    { k: 'Affiliation', v: a.military ? '★ Military' : 'Civilian' },
  ]
}

function shipRows(s: Ship): Row[] {
  return [
    { k: 'Name', v: s.name || '—' },
    { k: 'MMSI', v: s.id },
    { k: 'Type', v: s.shipType || '—' },
    { k: 'Flag', v: s.flag || '—' },
    { k: 'Speed', v: s.speed ? `${s.speed.toFixed(1)} kt` : '—' },
    { k: 'Course', v: s.heading ? compass(s.heading) : '—' },
    { k: 'Status', v: s.navStatus || '—' },
    { k: 'Destination', v: s.destination || '—' },
  ]
}

function fireRows(f: Fire): Row[] {
  return [
    { k: 'Satellite', v: f.satellite },
    { k: 'Brightness', v: f.brightness ? `${f.brightness.toFixed(0)} K` : '—' },
    { k: 'Fire power', v: f.frp ? `${f.frp.toFixed(1)} MW` : '—' },
    { k: 'Confidence', v: f.confidence || '—' },
    { k: 'Acquired', v: f.acquired || '—' },
    { k: 'Pass', v: f.daynight },
  ]
}

function eventRows(e: GeoEvent): Row[] {
  const rows: Row[] = [{ k: 'Type', v: e.kind }]
  if (e.country) rows.push({ k: 'Country', v: e.country })
  if (e.count) rows.push({ k: 'Reports/24h', v: String(e.count) })
  rows.push({ k: 'Detail', v: e.detail })
  rows.push({
    k: 'Observed',
    v: new Date(e.time).toLocaleString(),
  })
  return rows
}

export default function Dossier({ entity, onClose, onAsk }: Props) {
  // Refresh a selected camera: ~1s for truly-live NYC feeds, slower for stills.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (entity?.kind !== 'camera') return
    const ms = (entity as Camera).live ? 1000 : 15_000
    const t = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [entity])

  if (!entity) return null
  const e = entity
  const color = ENTITY_COLOR[e.kind] ?? '#9fb0c8'
  const glyph = ENTITY_GLYPH[e.kind] ?? '◆'

  let rows: Row[] = []
  let image: string | undefined
  let video: string | undefined
  let url: string | undefined
  if (e.kind === 'aircraft') rows = aircraftRows(e as Aircraft)
  else if (e.kind === 'ship') rows = shipRows(e as Ship)
  else if (e.kind === 'fire') rows = fireRows(e as Fire)
  else if (e.kind === 'camera') {
    const c = e as Camera
    rows = [
      { k: 'Location', v: c.name },
      { k: 'Region', v: c.region },
      { k: 'Road', v: c.road || '—' },
      { k: 'Source', v: c.source },
    ]
    image = c.image
    video = c.video
  } else {
    const ev = e as GeoEvent
    rows = eventRows(ev)
    url = ev.url
  }

  const liveImg = image
    ? `${image}${image.includes('?') ? '&' : '?'}_=${tick}`
    : undefined

  return (
    <aside className="dossier" onClick={(ev) => ev.stopPropagation()}>
      <div className="dossier-top" style={{ borderColor: color }}>
        <span className="dossier-glyph" style={{ color }}>
          {glyph}
        </span>
        <div className="dossier-titles">
          <span className="dossier-kind" style={{ color }}>
            {e.kind.toUpperCase()}
          </span>
          <h2>{entityTitle(e)}</h2>
        </div>
        <button className="dossier-x" onClick={onClose}>
          ✕
        </button>
      </div>

      {(liveImg || video) && (
        <div className="dossier-cam">
          {video ? (
            <video src={video} poster={image} autoPlay loop muted playsInline />
          ) : (
            <img src={liveImg} alt="live camera" loading="lazy" />
          )}
          <span className="cam-live">● LIVE</span>
        </div>
      )}

      <div className="dossier-grid">
        {rows.map((r) => (
          <div className="dossier-row" key={r.k}>
            <span className="dr-k">{r.k}</span>
            <span className="dr-v">{r.v}</span>
          </div>
        ))}
        <div className="dossier-row">
          <span className="dr-k">Position</span>
          <span className="dr-v">
            {e.lat.toFixed(4)}, {e.lng.toFixed(4)}
          </span>
        </div>
      </div>

      <div className="dossier-actions">
        <button className="dossier-ask" onClick={() => onAsk(e)}>
          ◉ Ask Operator about this
        </button>
        {safeUrl(url) && (
          <a
            className="dossier-src"
            href={safeUrl(url)}
            target="_blank"
            rel="noreferrer"
          >
            open source ↗
          </a>
        )}
        <a
          className="dossier-src"
          href={`https://www.google.com/maps/@${e.lat},${e.lng},8z`}
          target="_blank"
          rel="noreferrer"
        >
          locate on map ↗
        </a>
      </div>
    </aside>
  )
}
