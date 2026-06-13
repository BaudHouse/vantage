import { useEffect, useMemo, useRef, useState } from 'react'
import { TREND_METRICS as METRICS, type Snapshot } from '../trends'
import type { Anomaly } from '../anomaly'
import { forecastSeries, type SeriesForecast } from '../nn'
import { assessSituations, ollamaModel } from '../operator'
import Markdown from './Markdown'

interface Props {
  open: boolean
  onClose: () => void
  getContext: () => string
  // Snapshot history + detected anomalies are computed once in App (right
  // after each snapshot is recorded) and passed down — the modal does no
  // localStorage parsing or anomaly scanning of its own.
  snaps: Snapshot[]
  anomalies: Anomaly[]
  onCascade: (seed: string) => void
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

export default function TrendsModal({
  open,
  onClose,
  getContext,
  snaps,
  anomalies,
  onCascade,
}: Props) {
  const [scrub, setScrub] = useState<number | null>(null)
  const [assess, setAssess] = useState<{
    busy?: boolean
    text?: string
    err?: string
  } | null>(null)
  const assessedSigRef = useRef<string>('')

  const runAssess = async (anoms: Anomaly[]) => {
    if (!anoms.length) return
    setAssess({ busy: true })
    const model = await ollamaModel()
    if (!model) {
      setAssess({ err: 'Local model not ready (Ollama).' })
      return
    }
    const spikes = anoms.map((a) => {
      const fc = forecasts[a.key]
      const proj =
        fc?.trained && fc.skill > 0.02
          ? ` | neural forecast next: ${fc.predictions.join(', ')} (beats naive by ${Math.round(
              fc.skill * 100,
            )}%)`
          : ''
      return `${a.label}: ${a.current} vs baseline ${a.mean} (${
        a.z >= 99 ? 'spike' : `${a.z}σ`
      }, +${a.pct}%)${proj}`
    })
    const text = await assessSituations(model, spikes, getContext())
    setAssess(text ? { text } : { err: 'Operator unreachable.' })
  }

  // Auto-assess while open when situations are developing, but only once per
  // distinct anomaly set — reopening doesn't re-spam the model, while a
  // genuinely new spike (even mid-session) triggers a fresh read.
  useEffect(() => {
    if (!open || !anomalies.length) return
    const sig = anomalies.map((a) => a.key).sort().join(',')
    if (assessedSigRef.current === sig) return
    assessedSigRef.current = sig
    void runAssess(anomalies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anomalies])

  // Train the ported sunspot net on each metric's history and forecast the
  // next few steps (only when there's enough history to learn + score).
  const forecasts = useMemo(() => {
    const m: Record<string, SeriesForecast> = {}
    if (!open || snaps.length < 14) return m
    METRICS.forEach((met, i) => {
      const s = snaps.map((x) => x.m[met.key] ?? 0)
      m[met.key] = forecastSeries(s, {
        window: 6,
        hidden: 8,
        horizon: 3,
        epochs: 250,
        seed: i + 1,
      })
    })
    return m
    // snaps identity changes each refresh; key on length so we don't retrain
    // on every poll while the panel sits open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snaps.length])
  const anyForecast = Object.values(forecasts).some((f) => f.trained)

  // Forecast surprises: metrics where the latest reading diverges sharply from
  // a *skilful* model's expectation — the learned pattern broke. Complements
  // the z-score anomalies (a value can fit its range yet defy its own cycle).
  const surprises = METRICS.map((m) => ({ m, fc: forecasts[m.key] })).filter(
    ({ m, fc }) =>
      !!fc?.trained &&
      fc.skill > 0.05 &&
      fc.surprise >= 2.5 &&
      !anomalies.some((a) => a.key === m.key),
  )
  const currentOf = (key: string) =>
    snaps.length ? snaps[snaps.length - 1].m[key] ?? 0 : 0

  if (!open) return null
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
          {anyForecast && ' · 🧠 neural forecast trained on this history'}
        </p>

        {anomalies.length > 0 && (
          <div className="ew-panel">
            <div className="ew-title">
              ⚠ EARLY WARNING · {anomalies.length} developing
            </div>
            {anomalies.map((a) => {
              const fc = forecasts[a.key]
              const proj =
                fc?.trained && fc.predictions.length
                  ? fc.predictions.join(' · ')
                  : ''
              return (
                <div className="ew-row" key={a.key}>
                  <span className="ew-label">
                    {a.label}
                    {proj && <em className="ew-proj">🧠 → {proj}</em>}
                  </span>
                  <span className="ew-stat">
                    <b>{a.current}</b>
                    <em>
                      {a.z >= 99 ? 'spike' : `${a.z}σ`} · ▲{a.pct}% vs {a.mean}
                    </em>
                  </span>
                </div>
              )
            })}
            <div className="ew-actions">
              <button
                className="ew-assess"
                onClick={() => runAssess(anomalies)}
                disabled={assess?.busy}
              >
                {assess?.busy
                  ? '◍ assessing…'
                  : assess?.text
                    ? '↻ re-assess'
                    : '🔮 Assess situations'}
              </button>
              <button
                className="ew-cascade"
                onClick={() =>
                  onCascade(
                    `${anomalies[0].label} spiking to ${anomalies[0].current} (${
                      anomalies[0].z >= 99 ? 'sharp spike' : `${anomalies[0].z}σ`
                    } above baseline ${anomalies[0].mean})`,
                  )
                }
                title="Map the butterfly-effect cascade from the top developing situation"
              >
                🦋 Trace cascade
              </button>
            </div>
            {assess?.err && <div className="ew-err">⚠ {assess.err}</div>}
            {assess?.text && (
              <div className="ew-assessment">
                <Markdown text={assess.text} />
              </div>
            )}
          </div>
        )}

        {surprises.length > 0 && (
          <div className="surprise-panel">
            <div className="surprise-title">
              ◇ FORECAST SURPRISE · {surprises.length} off-pattern
            </div>
            {surprises.map(({ m, fc }) => (
              <div className="surprise-row" key={m.key}>
                <span className="surprise-label">{m.label}</span>
                <span className="surprise-stat">
                  now <b>{currentOf(m.key)}</b> · model expected {fc!.predictedLast}
                  <em>{fc!.surprise}σ off</em>
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
                const fc = forecasts[m.key]
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
                      {fc?.trained && (
                        <span className="trend-nn">
                          🧠 next {fc.predictions.join(' · ')}
                          <em
                            className={
                              fc.skill > 0.02
                                ? 'good'
                                : fc.skill < -0.02
                                  ? 'bad'
                                  : ''
                            }
                          >
                            {fc.skill > 0.02
                              ? `+${Math.round(fc.skill * 100)}% vs naive`
                              : fc.skill < -0.02
                                ? `${Math.round(fc.skill * 100)}% vs naive`
                                : 'flat'}
                          </em>
                        </span>
                      )}
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
