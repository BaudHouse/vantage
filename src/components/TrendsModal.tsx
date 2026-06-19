import { useEffect, useMemo, useRef, useState } from 'react'
import { TREND_METRICS as METRICS, type Snapshot } from '../trends'
import type { Anomaly } from '../anomaly'
import {
  forecastSeries,
  forecastMultivariate,
  backtestSeries,
  type SeriesForecast,
  type BacktestResult,
} from '../nn'
import { assessSituations, ollamaModel } from '../operator'
import {
  loadScore,
  scoreOf,
  coverageOf,
  forecastTrust as trustOf,
  MIN_PAIRS,
} from '../scorecard'
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
  // On-demand walk-forward validation. Heavier than the live single-split
  // forecast (it retrains a fresh net per fold per metric), so it runs only when
  // the analyst explicitly clicks "validate" — never on every snapshot.
  const [backtest, setBacktest] = useState<{
    busy?: boolean
    rows?: { key: string; label: string; b: BacktestResult }[]
  } | null>(null)

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
      const band =
        fc?.trained && fc.upper.length > 0 && fc.upper[0] > fc.lower[0]
          ? `, 80% interval ${fc.lower[0]}–${fc.upper[0]}`
          : ''
      // Only cite the forecast to the analyst when it's trusted, and say which
      // tier — a model that failed against real outcomes is omitted, not passed
      // off as a confident driver.
      const trust = fc?.trained ? trustFor(a.key, fc.skill) : 'unproven'
      const proj =
        fc?.trained && trust !== 'unproven'
          ? ` | neural forecast next: ${fc.predictions.join(', ')}${band} (${
              trust === 'validated'
                ? `validated, +${Math.round(
                    (realized[a.key]?.skill ?? 0) * 100,
                  )}% on real outcomes`
                : `provisional, +${Math.round(fc.skill * 100)}% vs naive on one split`
            })`
          : ''
      return `${a.label}: ${a.current} vs baseline ${a.mean} (${
        a.z >= 99 ? 'spike' : `${a.z}σ`
      }, +${a.pct}%)${proj}`
    })
    const text = await assessSituations(model, spikes, getContext())
    setAssess(text ? { text } : { err: 'Operator unreachable.' })
  }

  // Walk-forward backtest of every metric's history — the honest, low-variance
  // out-of-sample skill. Deferred a tick so the "validating…" state paints
  // before the synchronous retrain loop blocks the thread.
  const runBacktest = () => {
    setBacktest({ busy: true })
    setTimeout(() => {
      const rows = METRICS.map((met, i) => {
        const s = snaps.map((x) => x.m[met.key] ?? 0)
        return {
          key: met.key,
          label: met.label,
          b: backtestSeries(s, {
            window: 6,
            hidden: 8,
            epochs: 200,
            maxFolds: 24,
            seed: i + 1,
          }),
        }
      }).filter((r) => r.b.trained)
      setBacktest({ rows })
    }, 30)
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
    // Key on the LATEST snapshot's timestamp: retrains when genuinely new data
    // lands (not on scrub re-renders), and — unlike snaps.length — keeps working
    // after the 400-cap ring buffer stops growing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snaps.length ? snaps[snaps.length - 1].t : 0])
  const anyForecast = Object.values(forecasts).some((f) => f.trained)

  // Multivariate "all-signal" model: predict conflict zones from a window of
  // EVERY signal, so it can pick up cross-signal leading relationships.
  const multi = useMemo(() => {
    if (!open || snaps.length < 14) return null
    const keys = METRICS.map((m) => m.key)
    const matrix = snaps.map((s) => keys.map((k) => s.m[k] ?? 0))
    const targetIdx = keys.indexOf('active')
    if (targetIdx < 0) return null
    return forecastMultivariate(matrix, targetIdx, {
      window: 4,
      hidden: 12,
      epochs: 300,
      seed: 99,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snaps.length ? snaps[snaps.length - 1].t : 0])

  // Realized forward-forecast accuracy (scored against what ACTUALLY happened) —
  // the ground truth we trust over any single-split skill estimate. Computed
  // first so it can gate the surprise alerts below.
  const scoreStore = loadScore()
  const scored = METRICS.map((m) => ({
    m,
    s: scoreOf(scoreStore[m.key]?.pairs ?? []),
    cov: coverageOf(scoreStore[m.key]?.pairs ?? []),
  }))
  const realized: Record<string, { skill: number; n: number }> = {}
  scored.forEach(({ m, s }) => {
    realized[m.key] = { skill: s.skill, n: s.n }
  })
  // Trust a metric's forecast by its realized track record, falling back to its
  // single-split skill (see scorecard.forecastTrust). Gates alerts so a model
  // that has empirically failed against reality can't cry wolf.
  const trustFor = (key: string, splitSkill: number) =>
    trustOf(realized[key]?.skill ?? 0, realized[key]?.n ?? 0, splitSkill)

  // Forecast surprises: metrics where the latest reading diverges sharply from a
  // *trusted* model's expectation — the learned pattern broke. Complements the
  // z-score anomalies (a value can fit its range yet defy its own cycle). Gated
  // on trust so a model that has failed against real outcomes never alerts.
  const surprises = METRICS.map((m) => ({ m, fc: forecasts[m.key] })).filter(
    ({ m, fc }) =>
      !!fc?.trained &&
      fc.surprise >= 2.5 &&
      trustFor(m.key, fc.skill) !== 'unproven' &&
      !anomalies.some((a) => a.key === m.key),
  )
  const currentOf = (key: string) =>
    snaps.length ? snaps[snaps.length - 1].m[key] ?? 0 : 0

  // Learned per-metric bias used to debias future forecasts.
  const biasMap: Record<string, number> = {}
  scored.forEach(({ m, s }) => {
    biasMap[m.key] = s.n >= MIN_PAIRS ? s.bias : 0
  })
  const debias = (key: string, vals: number[]) => {
    const b = biasMap[key] || 0
    return b ? vals.map((v) => Math.round((v - b) * 10) / 10) : vals
  }
  const scores = scored
    .filter(({ s }) => s.n >= MIN_PAIRS)
    .sort((a, b) => b.s.n - a.s.n)

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

        {multi?.trained && (
          <div className="model-card">
            <div className="mc-head">
              🧠 ALL-SIGNAL MODEL
              <span className="mc-sub">
                trained on {multi.features} signals × {snaps.length} steps
              </span>
            </div>
            <div className="mc-body">
              <span className="mc-pred">
                conflict zones next: <b>{multi.prediction}</b>
              </span>
              <span
                className={`mc-skill ${
                  multi.skill > 0.02 ? 'good' : multi.skill < -0.02 ? 'bad' : ''
                }`}
              >
                {multi.skill > 0.02
                  ? `+${Math.round(multi.skill * 100)}% vs naive — cross-signal structure learned`
                  : multi.skill < -0.02
                    ? `${Math.round(multi.skill * 100)}% vs naive — no extra signal yet`
                    : 'on par with naive so far'}
              </span>
            </div>
          </div>
        )}

        {anyForecast && (
          <div className="score-card">
            <div className="sc-head">
              ⊕ WALK-FORWARD VALIDATION
              <span className="sc-sub">
                retrains the net per fold and scores each step out-of-sample —
                the honest skill, not one lucky split
              </span>
            </div>
            {backtest?.rows && backtest.rows.length > 0 && (
              <div className="sc-rows">
                {backtest.rows.map(({ key, label, b }) => (
                  <div className="sc-row" key={key}>
                    <span className="sc-label">{label}</span>
                    <span className="sc-stat">
                      <em>{b.folds}</em> folds ·{' '}
                      <b
                        className={
                          b.skill > 0.02 ? 'good' : b.skill < -0.02 ? 'bad' : ''
                        }
                      >
                        {b.skill > 0
                          ? `+${Math.round(b.skill * 100)}%`
                          : `${Math.round(b.skill * 100)}%`}{' '}
                        vs naive
                      </b>{' '}
                      · {Math.round(b.winRate * 100)}% folds won
                    </span>
                  </div>
                ))}
              </div>
            )}
            {backtest?.rows && backtest.rows.length === 0 && (
              <div className="sc-sub">
                Not enough history to walk forward yet — keep logging snapshots.
              </div>
            )}
            <div className="ew-actions">
              <button
                className="ew-assess"
                onClick={runBacktest}
                disabled={backtest?.busy}
              >
                {backtest?.busy
                  ? '◍ validating…'
                  : backtest?.rows
                    ? '↻ re-validate'
                    : '⊕ Validate (walk-forward)'}
              </button>
            </div>
          </div>
        )}

        {scores.length > 0 && (
          <div className="score-card">
            <div className="sc-head">
              ◎ FORECAST SCORECARD
              <span className="sc-sub">
                accuracy on forecasts scored against what actually happened
              </span>
            </div>
            <div className="sc-rows">
              {scores.map(({ m, s, cov }) => (
                <div className="sc-row" key={m.key}>
                  <span className="sc-label">{m.label}</span>
                  <span className="sc-stat">
                    <em>{s.n}</em> scored ·{' '}
                    <b
                      className={
                        s.skill > 0.02 ? 'good' : s.skill < -0.02 ? 'bad' : ''
                      }
                    >
                      {s.skill > 0
                        ? `+${Math.round(s.skill * 100)}%`
                        : `${Math.round(s.skill * 100)}%`}{' '}
                      vs naive
                    </b>{' '}
                    · {Math.round(s.hit * 100)}% direction
                    {Math.abs(s.bias) >= 0.5 && (
                      <> · bias {s.bias > 0 ? '+' : ''}{s.bias}</>
                    )}
                    {cov.n >= 4 && (
                      <>
                        {' '}
                        ·{' '}
                        <b
                          className={
                            Math.abs(cov.rate - 0.8) <= 0.15 ? 'good' : 'bad'
                          }
                          title="how often the realized value landed inside its 80% band (calibrated ≈ 80%)"
                        >
                          {Math.round(cov.rate * 100)}% in 80% band
                        </b>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {anomalies.length > 0 && (
          <div className="ew-panel">
            <div className="ew-title">
              ⚠ EARLY WARNING · {anomalies.length} developing
            </div>
            {anomalies.map((a) => {
              const fc = forecasts[a.key]
              const proj =
                fc?.trained && fc.predictions.length
                  ? debias(a.key, fc.predictions).join(' · ')
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
                          🧠 next {debias(m.key, fc.predictions).join(' · ')}
                          {biasMap[m.key] ? (
                            <em className="nn-cal" title="debiased from realized outcomes">
                              ↺
                            </em>
                          ) : null}
                          {fc.upper.length > 0 && fc.upper[0] > fc.lower[0] && (
                            <em
                              className="nn-pi"
                              style={{
                                opacity: 0.7,
                                fontStyle: 'normal',
                                marginLeft: 4,
                              }}
                              title="80% prediction interval, from the model's out-of-sample error"
                            >
                              (80%: {debias(m.key, [fc.lower[0]])[0]}–
                              {debias(m.key, [fc.upper[0]])[0]})
                            </em>
                          )}
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
                          {trustFor(m.key, fc.skill) === 'validated' && (
                            <em
                              className="good"
                              style={{ marginLeft: 4 }}
                              title={`validated on ${realized[m.key].n} real outcomes (beats naive)`}
                            >
                              ✓ validated
                            </em>
                          )}
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
