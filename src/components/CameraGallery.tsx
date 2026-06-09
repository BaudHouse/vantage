import { useEffect, useMemo, useState } from 'react'
import type { Camera } from '../layers'
import { fetchImageBase64 } from '../net'
import { analyzeArea, analyzeImage, visionModel } from '../operator'
import Markdown from './Markdown'

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
  const [vBusy, setVBusy] = useState(false)
  const [vResult, setVResult] = useState<string | null>(null)
  const [vErr, setVErr] = useState<string | null>(null)

  useEffect(() => {
    setVResult(null)
    setVErr(null)
  }, [zoom])

  // Area scan: analyze several frames from the current (filtered) view at once.
  const [area, setArea] = useState<{
    busy?: boolean
    result?: string | null
    err?: string | null
    status?: string
  } | null>(null)

  const scanArea = async (cams: Camera[]) => {
    const pick = cams.slice(0, 4)
    if (!pick.length) return
    setArea({ busy: true, status: 'finding vision model…' })
    const model = await visionModel()
    if (!model) {
      setArea({ err: 'No vision model. Run `ollama pull qwen2.5vl:7b`.' })
      return
    }
    setArea({ busy: true, status: `capturing ${pick.length} frames…` })
    const grabbed = await Promise.all(
      pick.map(async (c) => ({ cam: c, b64: await fetchImageBase64(c.image) })),
    )
    const ok = grabbed.filter((g) => g.b64) as { cam: Camera; b64: string }[]
    if (!ok.length) {
      setArea({ err: 'Could not capture any frames.' })
      return
    }
    setArea({ busy: true, status: `analyzing ${ok.length} cameras…` })
    const list = ok.map((g, i) => `${i + 1}. ${g.cam.name} (${g.cam.region})`).join('\n')
    const out = await analyzeArea(
      model,
      ok.map((g) => g.b64),
      `Live cameras in this view (in image order):\n${list}\n\nProduce a combined situational report.`,
    )
    setArea({ result: out ?? '⚠ Vision model unreachable.' })
  }

  const analyzeCam = async (cam: Camera) => {
    setVBusy(true)
    setVErr(null)
    setVResult(null)
    const model = await visionModel()
    if (!model) {
      setVErr('No vision model. Run `ollama pull qwen2.5vl:7b`.')
      setVBusy(false)
      return
    }
    const b64 = await fetchImageBase64(cam.image)
    if (!b64) {
      setVErr('Could not capture the frame.')
      setVBusy(false)
      return
    }
    const out = await analyzeImage(
      model,
      b64,
      `Analyze this live camera at ${cam.name}${cam.region ? ` (${cam.region})` : ''}.`,
    )
    setVResult(out ?? '⚠ Vision model unreachable.')
    setVBusy(false)
  }

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

  const regions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of cameras) {
      const top = (c.region || c.source).split('·')[0].trim()
      counts.set(top, (counts.get(top) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [cameras])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return cameras
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          c.road.toLowerCase().includes(term) ||
          c.region.toLowerCase().includes(term),
      )
      .slice(0, 300)
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
            placeholder="Search a state, region, road or location…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="cg-scan"
            onClick={() => scanArea(list)}
            disabled={area?.busy || !list.length}
            title="AI situational report from several cameras in this view"
          >
            {area?.busy ? '◍ scanning…' : '🛰 AI scan view'}
          </button>
          <button className="cg-x" onClick={onClose}>
            ✕
          </button>
        </div>

        {area && (
          <div className="cg-sitrep">
            <div className="cg-sitrep-head">
              <b>◉ AREA SITREP{q ? ` · ${q}` : ''}</b>
              <button onClick={() => setArea(null)}>✕</button>
            </div>
            {area.busy && <div className="cg-sitrep-busy">{area.status}</div>}
            {area.err && <div className="vision-err">⚠ {area.err}</div>}
            {area.result && (
              <div className="cg-sitrep-body">
                <Markdown text={area.result} />
              </div>
            )}
          </div>
        )}

        <div className="cg-regions">
          <button
            className={`cg-chip ${!q ? 'on' : ''}`}
            onClick={() => setQ('')}
          >
            All · {cameras.length}
          </button>
          {regions.map(([r, n]) => (
            <button
              key={r}
              className={`cg-chip ${q === r ? 'on' : ''}`}
              onClick={() => setQ(r)}
            >
              {r} · {n}
            </button>
          ))}
        </div>

        <div className="cg-grid">
          {list.map((c) => (
            <button className="cg-cell" key={c.id} onClick={() => setZoom(c)}>
              <img
                src={live(c.image, tick)}
                alt={c.name}
                loading="lazy"
                onError={(e) => {
                  const cell = (e.currentTarget.closest('.cg-cell') as HTMLElement)
                  if (cell) cell.style.display = 'none'
                }}
              />
              <span className="cg-cap">
                {c.name}
                <em className="cg-cap-region">{c.region}</em>
              </span>
              {c.live && <span className="cg-live">● LIVE</span>}
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
                <span className="cg-lb-road"> · {zoom.region}</span>
              </div>
              <button className="cg-x" onClick={() => setZoom(null)}>
                ✕
              </button>
            </div>
            {zoom.video ? (
              <video
                key={zoom.id}
                src={zoom.video}
                poster={zoom.image}
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={live(zoom.image, lbTick)} alt={zoom.name} />
            )}
            <div className="cg-lb-foot">
              <span>
                {zoom.source}
                {zoom.video
                  ? ' · video feed'
                  : zoom.live
                    ? ' · streaming ~1s'
                    : ' · refreshing'}
              </span>
              <a
                href={zoom.video || live(zoom.image, lbTick)}
                target="_blank"
                rel="noreferrer"
              >
                open {zoom.video ? 'video' : 'full image'} ↗
              </a>
            </div>
            <div className="vision" style={{ padding: '0 15px 14px' }}>
              <button
                className="vision-btn"
                onClick={() => analyzeCam(zoom)}
                disabled={vBusy}
              >
                {vBusy ? '◍ analyzing frame…' : '🔍 AI analyze this frame'}
              </button>
              {vErr && <div className="vision-err">⚠ {vErr}</div>}
              {vResult && (
                <div className="vision-out">
                  <Markdown text={vResult} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
