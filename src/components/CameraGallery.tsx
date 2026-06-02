import { useEffect, useMemo, useState } from 'react'
import type { Camera } from '../layers'

interface Props {
  cameras: Camera[]
  open: boolean
  onClose: () => void
}

// Append a coarse cache-buster so the browser pulls a fresh frame on refresh.
function live(url: string, tick: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}_=${tick}`
}

export default function CameraGallery({ cameras, open, onClose }: Props) {
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [lbTick, setLbTick] = useState(0)
  const [zoom, setZoom] = useState<Camera | null>(null)

  // Thumbnails refresh every ~12s to stay current without hammering.
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setTick((n) => n + 1), 12_000)
    return () => clearInterval(t)
  }, [open])

  // The enlarged cam refreshes fast — ~1s for live NYC feeds (true motion),
  // slower for periodic stills.
  useEffect(() => {
    if (!zoom) return
    const ms = zoom.live ? 1000 : 12_000
    const t = setInterval(() => setLbTick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [zoom])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return cameras
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          c.road.toLowerCase().includes(term),
      )
      .slice(0, 200)
  }, [cameras, q])

  if (!open) return null

  return (
    <div className="cam-gallery" onClick={onClose}>
      <div className="cg-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cg-head">
          <div className="cg-title">
            <span className="cg-glyph">📷</span>
            <b>TRAFFIC CAMERAS</b>
            <span className="cg-count">{cameras.length} live feeds</span>
          </div>
          <input
            className="cg-search"
            placeholder="Search by road or location…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="cg-x" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cg-grid">
          {list.map((c) => (
            <button className="cg-cell" key={c.id} onClick={() => setZoom(c)}>
              <img src={live(c.image, tick)} alt={c.name} loading="lazy" />
              <span className="cg-cap">{c.name}</span>
              <span className="cg-live">● LIVE</span>
            </button>
          ))}
          {!list.length && (
            <div className="cg-empty">
              No cameras match “{q}”. Toggle the Traffic Cams layer on to load
              feeds.
            </div>
          )}
        </div>
      </div>

      {zoom && (
        <div className="cg-lightbox" onClick={() => setZoom(null)}>
          <div className="cg-lb-card" onClick={(e) => e.stopPropagation()}>
            <div className="cg-lb-head">
              <div>
                <b>{zoom.name}</b>
                {zoom.road && <span className="cg-lb-road"> · {zoom.road}</span>}
              </div>
              <button className="cg-x" onClick={() => setZoom(null)}>
                ✕
              </button>
            </div>
            <img src={live(zoom.image, lbTick)} alt={zoom.name} />
            <div className="cg-lb-foot">
              <span>
                {zoom.source}
                {zoom.live ? ' · streaming ~1s' : ' · refreshing'}
              </span>
              <a href={live(zoom.image, lbTick)} target="_blank" rel="noreferrer">
                open full image ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
