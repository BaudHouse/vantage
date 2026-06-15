import { useEffect, useState } from 'react'
import {
  traceCascadeEnsemble,
  chainProbability,
  type Cascade,
  type CascadeDomain,
} from '../cascade'
import { ollamaModel, chatModels } from '../operator'
import Markdown from './Markdown'

interface Props {
  open: boolean
  seed: string
  onClose: () => void
  getContext: () => string
  grounding?: string // live developing-situations context to anchor the cascade
}

const DOMAIN_COLOR: Record<CascadeDomain, string> = {
  MIL: '#ff4d4d',
  ECON: '#3ddc97',
  CIVIL: '#5fd0e0',
  ENERGY: '#ffb000',
  CYBER: '#c08bff',
  DIPLO: '#4db8ff',
  SUPPLY: '#ff7a1a',
  OTHER: '#8da0ba',
}

function probClass(p: number): string {
  if (p >= 35) return 'hi'
  if (p >= 15) return 'mid'
  return 'lo'
}

export default function ButterflyModal({
  open,
  seed,
  onClose,
  getContext,
  grounding,
}: Props) {
  const [trigger, setTrigger] = useState(seed)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<Cascade | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Reset to the seed each time the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setTrigger(seed)
      setResult(null)
      setErr(null)
    }
  }, [open, seed])

  const run = async () => {
    const t = trigger.trim()
    if (!t || busy) return
    setBusy(true)
    setErr(null)
    setResult(null)
    setStatus('finding vision model…')
    const model = await ollamaModel()
    if (!model) {
      setErr('Local model not ready (Ollama).')
      setBusy(false)
      setStatus('')
      return
    }
    // Ensemble: several independent drafts reconciled into a calibrated
    // consensus — slower, but the most accurate cascade we can produce locally.
    const ctx = grounding ? `${getContext()}\n\n${grounding}` : getContext()
    // Use all installed chat models so the drafts are architecturally diverse.
    const pool = await chatModels()
    const c = await traceCascadeEnsemble(model, t, ctx, {
      models: pool,
      onProgress: setStatus,
    })
    setStatus('')
    if (!c.chains.length)
      setErr('No cascade returned — try rephrasing the trigger.')
    else setResult(c)
    setBusy(false)
  }

  if (!open) return null

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="bf-card"
        role="dialog"
        aria-modal="true"
        aria-label="Butterfly-effect cascade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bf-head">
          <div>
            <span className="bf-kicker">🦋 BUTTERFLY EFFECT</span>
            <h2>Second-order cascade</h2>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="bf-input">
          <input
            value={trigger}
            placeholder="Trigger event — e.g. ‘Strait of Hormuz incident’"
            onChange={(e) => setTrigger(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <button onClick={run} disabled={busy || !trigger.trim()}>
            {busy ? '◍ tracing…' : 'Trace'}
          </button>
        </div>

        {busy && status && <div className="bf-status">◍ {status}</div>}
        {err && <div className="bf-err">⚠ {err}</div>}

        {result && (
          <div className="bf-out">
            <div className="bf-trigger">
              ⚡ {trigger.trim()}
              {result.samples && result.samples > 1 && (
                <span className="bf-consensus">
                  consensus of {result.samples} drafts
                </span>
              )}
            </div>
            {result.chains.map((chain, ci) => {
              const p = chainProbability(chain)
              return (
                <div className="bf-chain" key={ci}>
                  {chain.steps.map((s, si) => (
                    <div className="bf-step-wrap" key={si}>
                      {si > 0 && <span className="bf-arrow">→</span>}
                      <div
                        className="bf-step"
                        style={{ borderColor: DOMAIN_COLOR[s.domain] }}
                      >
                        <div className="bf-step-top">
                          <span
                            className="bf-domain"
                            style={{ color: DOMAIN_COLOR[s.domain] }}
                          >
                            {s.domain}
                          </span>
                          <span className="bf-meta">
                            {s.likelihood}% · {s.horizon}
                          </span>
                        </div>
                        <div className="bf-effect">{s.effect}</div>
                      </div>
                    </div>
                  ))}
                  <span className="bf-tail">
                    {chain.agreement && result.samples && result.samples > 1 && (
                      <span
                        className="bf-agree"
                        title={`${chain.agreement} of ${result.samples} independent drafts produced this chain`}
                      >
                        {chain.agreement}/{result.samples} agree
                      </span>
                    )}
                    <span
                      className={`bf-prob ${probClass(p)}`}
                      title="Compounded probability the whole chain plays out"
                    >
                      ∴ {p}%
                    </span>
                  </span>
                </div>
              )
            })}
            {result.bottomLine && (
              <div className="bf-bottom">
                <span className="bf-kicker">BOTTOM LINE</span>
                <Markdown text={result.bottomLine} />
              </div>
            )}
          </div>
        )}

        {!result && !err && !busy && (
          <div className="bf-hint">
            Enter any trigger — a real event, a “what if”, or a tracked entity —
            and the Operator maps the chains of downstream effects it could set
            off, with each chain’s compounded likelihood.
          </div>
        )}
      </div>
    </div>
  )
}
