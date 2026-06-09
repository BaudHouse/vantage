import { getTrends } from '../trends'

interface Props {
  open: boolean
  onClose: () => void
}

const METRICS: { key: string; label: string; color: string }[] = [
  { key: 'active', label: 'Active conflict zones', color: '#ff4d4d' },
  { key: 'tensions', label: 'Tension zones', color: '#ffb000' },
  { key: 'quakes', label: 'Earthquakes (24h)', color: '#ffd24d' },
  { key: 'hazards', label: 'Hazard alerts (GDACS)', color: '#ff9500' },
  { key: 'storms', label: 'Tropical cyclones', color: '#4dd0e1' },
  { key: 'fires', label: 'Wildfires', color: '#ff7a1a' },
  { key: 'aircraft', label: 'Aircraft tracked', color: '#e8eefc' },
  { key: 'ships', label: 'Vessels (AIS)', color: '#3ddc97' },
  { key: 'alerts', label: 'Severe wx alerts (US)', color: '#ffd24d' },
  { key: 'airquality', label: 'AQI stations', color: '#7e57c2' },
]

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 180
  const h = 34
  if (values.length < 2) {
    return <svg width={w} height={h} className="spark" />
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - 3 - ((v - min) / span) * (h - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="spark" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  )
}

export default function TrendsModal({ open, onClose }: Props) {
  if (!open) return null
  const snaps = getTrends()
  const span =
    snaps.length > 1
      ? Math.round((snaps[snaps.length - 1].t - snaps[0].t) / 60000)
      : 0

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

        {snaps.length < 2 ? (
          <div className="trends-empty">
            Not enough history yet — keep Vantage running and trends accumulate
            every couple of minutes.
          </div>
        ) : (
          <div className="trends-grid">
            {METRICS.map((m) => {
              const series = snaps.map((s) => s.m[m.key] ?? 0)
              const now = series[series.length - 1]
              const prev = series[0]
              const delta = now - prev
              const peak = Math.max(...series)
              if (peak === 0) return null
              return (
                <div className="trend-row" key={m.key}>
                  <div className="trend-meta">
                    <span className="trend-label">{m.label}</span>
                    <span className="trend-now" style={{ color: m.color }}>
                      {now}
                      <em
                        className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}
                      >
                        {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '—'}
                      </em>
                    </span>
                  </div>
                  <Spark values={series} color={m.color} />
                  <span className="trend-peak">pk {peak}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
