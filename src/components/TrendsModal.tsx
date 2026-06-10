import { useState } from 'react'
import { getTrends, TREND_METRICS as METRICS } from '../trends'
import { detectAnomalies } from '../anomaly'

interface Props {
  open: boolean
  onClose: () => void
}

function Spark({
  values,
  color,
  markerIdx,
}: {
  values: number[]
  color: string
  markerIdx: number
}) {
  const w = 180
  const h = 34
  if (values.length < 2) {
    return <svg width={w} height={h} className="spark" />
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const xAt = (i: number) => (i / (values.length - 1)) * w
  const yAt = (v: number) => h - 3 - ((v - min) / span) * (h - 6)
  const pts = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')
  const mx = xAt(markerIdx)
  return (
    <svg width={w} height={h} className="spark" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />
      <line x1={mx} y1={0} x2={mx} y2={h} stroke={color} strokeWidth={0.8} opacity={0.35} />
      <circle cx={mx} cy={yAt(values[markerIdx])} r={2.4} fill={color} />
    </svg>
  )
}

export default function TrendsModal({ open, onClose }: Props) {
  const [scrub, setScrub] = useState<number | null>(null)
  if (!open) return null
  const snaps = getTrends()
  const last = snaps.length - 1
  const idx = scrub == null ? last : Math.min(scrub, last)
  const atLive = idx >= last
  const span =
    snaps.length > 1
      ? Math.round((snaps[snaps.length - 1].t - snaps[0].t) / 60000)
      : 0
  const stamp = snaps.length
    ? new Date(snaps[idx].t).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const anomalies = detectAnomalies(snaps, METRICS)

  return (
    <div className="modal" onClick={onClose}>
      <div className="trends-card" onClick={(e) => e.stopPropagation()}>
        <div className="trends-head">
          <div>
            <span className="trends-kicker">HISTORICAL TRENDS</span>
            <h2>Global picture over time</h2>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="trends-sub">
          {snaps.length} snapshots · spanning{' '}
          {span >= 60 ? `${(span / 60).toFixed(1)} h` : `${span} min`} · auto-logged
          each refresh
        </p>

        {anomalies.length > 0 && (
          <div className="ew-panel">
            <div className="ew-title">
              ⚠ EARLY WARNING · {anomalies.length} developing
            </div>
            {anomalies.map((a) => (
              <div className="ew-row" key={a.key}>
                <span className="ew-label">{a.label}</span>
                <span className="ew-stat">
                  <b>{a.current}</b>
                  <em>
                    {a.z >= 99 ? 'spike' : `${a.z}σ`} · ▲{a.pct}% vs {a.mean}
                  </em>
                </span>
              </div>
            ))}
          </div>
        )}

        {snaps.length < 2 ? (
          <div className="trends-empty">
            Not enough history yet — keep Vantage running and trends accumulate
            every couple of minutes.
          </div>
        ) : (
          <>
            <div className="trends-scrub">
              <input
                type="range"
                min={0}
                max={last}
                value={idx}
                onChange={(e) => setScrub(Number(e.target.value))}
                aria-label="Scrub through trend history"
              />
              <span className={`scrub-time ${atLive ? 'live' : ''}`}>
                {atLive ? '● LIVE' : `⟲ ${stamp}`}
              </span>
              {!atLive && (
                <button className="scrub-live" onClick={() => setScrub(null)}>
                  jump to live
                </button>
              )}
            </div>
            <div className="trends-grid">
              {METRICS.map((m) => {
                const series = snaps.map((s) => s.m[m.key] ?? 0)
                const now = series[idx]
                const delta = now - series[0]
                const peak = Math.max(...series)
                if (peak === 0) return null
                return (
                  <div className="trend-row" key={m.key}>
                    <div className="trend-meta">
                      <span className="trend-label">{m.label}</span>
                      <span className="trend-now" style={{ color: m.color }}>
                        {now}
                        <em className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
                          {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '—'}
                        </em>
                      </span>
                    </div>
                    <Spark values={series} color={m.color} markerIdx={idx} />
                    <span className="trend-peak">pk {peak}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
