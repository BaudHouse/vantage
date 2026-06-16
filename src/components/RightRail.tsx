import { useEffect, useRef, useState } from 'react'
import {
  MARKETS,
  castVote,
  getVotes,
  view,
  loadGenerated,
  saveGenerated,
  buildGeneratedMarkets,
  type Market,
  type PredCategory,
} from '../predictions'
import { sentiment, type Quote, type QuoteGroup } from '../markets'
import { forecastMarket, ollamaModel, proposeMarkets } from '../operator'
import {
  loadResolutions,
  resolve,
  unresolve,
  brierScore,
  brierSkill,
  reliability,
} from '../calibration'
import Markdown from './Markdown'

const CAT_COLOR: Record<PredCategory, string> = {
  MIL: '#ff4d4d',
  GEO: '#ffb000',
  ECON: '#3ddc97',
  CIVIL: '#5fd0e0',
}

const SCENARIOS = [
  {
    title: 'Eastern Front — 30-day projection',
    odds: 'Elevated',
    body: 'Sustained strikes on Kyiv energy grid suggest a winter pressure campaign. Watch rail logistics and AD ammunition resupply as the leading indicators.',
  },
  {
    title: 'Red Sea shipping',
    odds: 'Volatile',
    body: 'Renewed maritime incidents raise reroute risk around the Cape, pressuring Brent and container rates. Insurance premiums are the tell.',
  },
  {
    title: 'Taiwan Strait posture',
    odds: 'Watch',
    body: 'Grey-zone air incursions trending up. A declared exercise window would be the escalation marker; semiconductor equities price the tail risk.',
  },
]

interface AiState {
  loading?: boolean
  probability?: number
  rationale?: string
  error?: string
}

function Predictions({ getContext }: { getContext: () => string }) {
  const [votes, setVotes] = useState(getVotes())
  const [ai, setAi] = useState<Record<string, AiState>>({})
  const [allBusy, setAllBusy] = useState(false)
  const [generated, setGenerated] = useState<Market[]>(() => loadGenerated())
  const [genBusy, setGenBusy] = useState(false)
  const [genErr, setGenErr] = useState<string | null>(null)

  const markets = [...generated, ...MARKETS]

  const [resolved, setResolved] = useState(() => loadResolutions())
  const resolvedById = new Map(resolved.map((r) => [r.id, r]))
  const recordResolution = (
    id: string,
    question: string,
    prob: number,
    outcome: 0 | 1,
  ) => {
    resolve({ id, question, prob, outcome })
    setResolved(loadResolutions())
  }
  const clearResolution = (id: string) => {
    unresolve(id)
    setResolved(loadResolutions())
  }
  const brier = brierScore(resolved)
  const skill = brierSkill(resolved)
  const bins = reliability(resolved)

  const generate = async () => {
    setGenBusy(true)
    setGenErr(null)
    const model = await ollamaModel()
    if (!model) {
      setGenErr('Local model not ready (Ollama).')
      setGenBusy(false)
      return
    }
    const existing = markets.map((m) => m.question)
    const proposals = await proposeMarkets(model, getContext(), existing)
    if (!proposals.length) {
      setGenErr('No new questions returned — try again.')
      setGenBusy(false)
      return
    }
    const fresh = buildGeneratedMarkets(proposals, Date.now())
    const next = [...fresh, ...generated].slice(0, 12)
    setGenerated(next)
    saveGenerated(next)
    setGenBusy(false)
  }

  const clearGenerated = () => {
    setGenerated([])
    saveGenerated([])
  }

  // First visit with no generated markets: once the live feed has had a moment
  // to populate, quietly propose a fresh batch so the board isn't just the 8
  // seeds. Runs at most once per session and silently no-ops without a model.
  const autoTried = useRef(false)
  useEffect(() => {
    if (autoTried.current || generated.length > 0) return
    // Set the guard INSIDE the callback, not synchronously — otherwise React
    // StrictMode's mount/unmount/mount cycle clears this timeout and the second
    // run early-returns, so it would never fire in dev.
    const t = setTimeout(() => {
      if (autoTried.current || generated.length > 0 || genBusy) return
      autoTried.current = true
      void generate()
    }, 6000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runForecast = async (id: string, question: string) => {
    setAi((s) => ({ ...s, [id]: { ...s[id], loading: true, error: undefined } }))
    const model = await ollamaModel()
    if (!model) {
      setAi((s) => ({
        ...s,
        [id]: { loading: false, error: 'Local model not ready (Ollama).' },
      }))
      return
    }
    const f = await forecastMarket(model, question, getContext())
    setAi((s) => ({
      ...s,
      [id]: f
        ? { loading: false, probability: f.probability, rationale: f.rationale }
        : { loading: false, error: 'Operator unreachable.' },
    }))
  }

  const runAll = async () => {
    setAllBusy(true)
    for (const m of markets) {
      // eslint-disable-next-line no-await-in-loop
      await runForecast(m.id, m.question)
    }
    setAllBusy(false)
  }

  return (
    <div className="preds">
      <div className="pred-actions">
        <button className="ai-all" onClick={runAll} disabled={allBusy || genBusy}>
          {allBusy ? '◍ forecasting…' : '🔮 FORECAST ALL'}
        </button>
        <button
          className="ai-gen"
          onClick={generate}
          disabled={genBusy || allBusy}
          title="Propose fresh prediction markets from the live feed"
        >
          {genBusy ? '◍ generating…' : '✨ NEW FROM FEED'}
        </button>
      </div>
      {genErr && <div className="ai-err">⚠ {genErr}</div>}
      {generated.length > 0 && (
        <button className="gen-clear" onClick={clearGenerated}>
          clear {generated.length} generated ✕
        </button>
      )}

      {brier != null && (
        <div className="cal-card">
          <div className="cal-head">
            ◎ CALIBRATION
            <span className="cal-sub">{resolved.length} forecasts resolved</span>
          </div>
          <div className="cal-stats">
            <span>
              Brier <b>{brier}</b>
              <em>(0 = perfect, 0.25 = coin-flip)</em>
            </span>
            {skill != null && (
              <span
                className={`cal-skill ${
                  skill > 0.02 ? 'good' : skill < -0.02 ? 'bad' : ''
                }`}
              >
                skill {skill > 0 ? '+' : ''}
                {Math.round(skill * 100)}% vs base rate
              </span>
            )}
          </div>
          {bins.length > 1 && (
            <div className="cal-bins">
              {bins.map((b) => (
                <div className="cal-bin" key={b.lo}>
                  <span className="cb-pred">said ~{Math.round(b.predicted)}%</span>
                  <span className="cb-arrow">→</span>
                  <span
                    className={`cb-act ${
                      Math.abs(b.actual - b.predicted) <= 12 ? 'ok' : 'off'
                    }`}
                  >
                    happened {b.actual}%
                  </span>
                  <span className="cb-n">n={b.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {markets.map((m) => {
        const v = view(m, votes)
        const a = ai[m.id] ?? {}
        return (
          <div className="pred" key={m.id}>
            <div className="pred-head">
              <span className="cat" style={{ color: CAT_COLOR[m.category] }}>
                ◈ {m.category}
                {m.generated && <em className="gen-tag">NEW · AI</em>}
              </span>
              <span className="pred-meta">
                {v.votes} votes · {v.daysLeft}d
              </span>
            </div>
            <div className="pred-q">{m.question}</div>
            <div className="pred-bar">
              <span className="yes" style={{ width: `${v.yes}%` }}>
                {v.yes}%
              </span>
              <span className="no" style={{ width: `${v.no}%` }}>
                {v.no}%
              </span>
            </div>
            <div className="pred-vote">
              <button
                className={v.myVote === 'yes' ? 'on yes' : ''}
                onClick={() => setVotes(castVote(m.id, 'yes'))}
              >
                YES
              </button>
              <button
                className={v.myVote === 'no' ? 'on no' : ''}
                onClick={() => setVotes(castVote(m.id, 'no'))}
              >
                NO
              </button>
            </div>

            {(() => {
              const res = resolvedById.get(m.id)
              const fcProb = a.probability ?? v.yes // score the AI forecast if run, else the crowd
              return res ? (
                <div className="pred-resolved">
                  ✓ resolved: <b>{res.outcome ? 'happened' : 'did not'}</b>{' '}
                  (forecast was {res.prob}%)
                  <button
                    className="res-undo"
                    onClick={() => clearResolution(m.id)}
                  >
                    undo
                  </button>
                </div>
              ) : (
                <div className="pred-resolve">
                  <span>resolve outcome:</span>
                  <button
                    onClick={() =>
                      recordResolution(m.id, m.question, fcProb, 1)
                    }
                  >
                    ✓ happened
                  </button>
                  <button
                    onClick={() =>
                      recordResolution(m.id, m.question, fcProb, 0)
                    }
                  >
                    ✗ didn’t
                  </button>
                </div>
              )
            })()}

            {a.probability != null && (
              <div className="ai-fc">
                <div className="ai-fc-head">
                  <span className="ai-tag">◉ OPERATOR</span>
                  <span className="ai-prob">{a.probability}% YES</span>
                </div>
                <div className="ai-meter">
                  <span style={{ width: `${a.probability}%` }} />
                </div>
                {a.rationale && (
                  <div className="ai-why">
                    <Markdown text={a.rationale} />
                  </div>
                )}
              </div>
            )}
            {a.error && <div className="ai-err">⚠ {a.error}</div>}

            <button
              className="ai-btn"
              onClick={() => runForecast(m.id, m.question)}
              disabled={a.loading || allBusy}
            >
              {a.loading
                ? '◍ analyzing…'
                : a.probability != null
                  ? '↻ re-forecast'
                  : '🔮 AI forecast'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Scenarios() {
  return (
    <div className="scenarios">
      {SCENARIOS.map((s) => (
        <div className="scn" key={s.title}>
          <div className="scn-head">
            <b>{s.title}</b>
            <span className="scn-odds">{s.odds}</span>
          </div>
          <p>{s.body}</p>
        </div>
      ))}
    </div>
  )
}

const GROUP_LABEL: Record<QuoteGroup, string> = {
  defense: 'DEFENSE STOCKS',
  commodity: 'COMMODITIES',
  forex: 'FOREX',
  crypto: 'CRYPTO',
}

function Markets({ quotes }: { quotes: Quote[] }) {
  const sent = sentiment(quotes)
  const groups: QuoteGroup[] = ['defense', 'commodity', 'forex']
  return (
    <div className="markets">
      <div className="mk-head">
        <span>📊 MARKETS</span>
        <span className={`sent sent-${sent.toLowerCase()}`}>{sent}</span>
      </div>
      {groups.map((g) => {
        const rows = quotes.filter((q) => q.group === g)
        if (!rows.length) return null
        return (
          <div className="mk-group" key={g}>
            <div className="mk-label">{GROUP_LABEL[g]}</div>
            {rows.map((q) => (
              <div className="mk-row" key={q.symbol}>
                <span className="mk-name">
                  {q.flag && <span className="mk-flag">{q.flag}</span>}
                  {q.name}
                </span>
                <span className="mk-px">
                  {q.price.toLocaleString(undefined, {
                    maximumFractionDigits: q.price < 10 ? 4 : 2,
                  })}
                  <em className={q.changePct >= 0 ? 'up' : 'down'}>
                    {q.changePct >= 0 ? '▲' : '▼'}
                    {Math.abs(q.changePct).toFixed(2)}%
                  </em>
                </span>
              </div>
            ))}
          </div>
        )
      })}
      {!quotes.length && <div className="empty">Markets loading…</div>}
    </div>
  )
}

export default function RightRail({
  quotes,
  getContext,
}: {
  quotes: Quote[]
  getContext: () => string
}) {
  const [tab, setTab] = useState<'pred' | 'scn'>('pred')
  return (
    <aside className="rail">
      <div className="rail-tabs">
        <button
          className={tab === 'pred' ? 'active' : ''}
          onClick={() => setTab('pred')}
        >
          ◎ PREDICTIONS
        </button>
        <button
          className={tab === 'scn' ? 'active' : ''}
          onClick={() => setTab('scn')}
        >
          ◇ SCENARIOS
        </button>
      </div>
      <div className="rail-scroll">
        {tab === 'pred' ? <Predictions getContext={getContext} /> : <Scenarios />}
        <Markets quotes={quotes} />
      </div>
    </aside>
  )
}
