// Butterfly-effect prediction model. Given a trigger event + the live picture,
// the local model maps how it could CASCADE: several causal chains of
// downstream effects across domains, each step with a conditional likelihood.
// The product of a chain's likelihoods is the "butterfly" probability — small
// trigger, certainty decaying as the chain runs out.

import { chat, type ChatMsg } from './operator'

export type CascadeDomain =
  | 'MIL'
  | 'ECON'
  | 'CIVIL'
  | 'ENERGY'
  | 'CYBER'
  | 'DIPLO'
  | 'SUPPLY'
  | 'OTHER'

export interface CascadeStep {
  domain: CascadeDomain
  effect: string
  likelihood: number // 0..100, CONDITIONAL on the prior step
  horizon: string // e.g. "24-72h", "1-2wk", "1-3mo"
}

export interface CascadeChain {
  steps: CascadeStep[]
}

export interface Cascade {
  chains: CascadeChain[]
  bottomLine: string
}

const DOMAINS = new Set([
  'MIL',
  'ECON',
  'CIVIL',
  'ENERGY',
  'CYBER',
  'DIPLO',
  'SUPPLY',
  'OTHER',
])

/** Compounded probability the WHOLE chain plays out (product of steps). 0..100. */
export function chainProbability(chain: CascadeChain): number {
  if (!chain.steps.length) return 0
  const p = chain.steps.reduce((acc, s) => acc * (s.likelihood / 100), 1)
  return Math.round(p * 100)
}

function coerceStep(o: unknown): CascadeStep | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const effect = String(r.effect ?? r.text ?? '').trim()
  if (effect.length < 4) return null
  const domain = String(r.domain ?? 'OTHER').toUpperCase()
  let likelihood = Number(r.likelihood ?? r.probability)
  if (!Number.isFinite(likelihood)) likelihood = 50
  likelihood = Math.max(1, Math.min(100, Math.round(likelihood)))
  const horizon = String(r.horizon ?? r.timeframe ?? '—').trim() || '—'
  return {
    domain: (DOMAINS.has(domain) ? domain : 'OTHER') as CascadeDomain,
    effect,
    likelihood,
    horizon,
  }
}

/** Pull a clean Cascade out of a (possibly messy) model response. */
export function parseCascade(text: string): Cascade {
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        data = JSON.parse(m[0])
      } catch {
        return { chains: [], bottomLine: '' }
      }
    }
  }
  if (!data || typeof data !== 'object') return { chains: [], bottomLine: '' }
  const o = data as Record<string, unknown>
  const rawChains = Array.isArray(o.chains)
    ? o.chains
    : Array.isArray(o.cascade)
      ? o.cascade
      : []
  const chains: CascadeChain[] = []
  for (const c of rawChains) {
    const rawSteps =
      c && typeof c === 'object' && Array.isArray((c as any).steps)
        ? (c as any).steps
        : Array.isArray(c)
          ? c
          : []
    const steps = rawSteps
      .map(coerceStep)
      .filter((s: CascadeStep | null): s is CascadeStep => s !== null)
    if (steps.length) chains.push({ steps })
    if (chains.length >= 5) break
  }
  const bottomLine = String(o.bottom_line ?? o.bottomLine ?? '').trim()
  return { chains, bottomLine }
}

const CASCADE_SYSTEM = `You are VANTAGE's second-order-effects analyst. Given a
TRIGGER event and the live situation, map how it could CASCADE — the butterfly
effect. Produce 3-4 DISTINCT causal chains. Each chain is an ordered sequence of
2-4 downstream effects that plausibly follow one from the next, spanning
different domains. For each step give: domain (one of MIL, ECON, CIVIL, ENERGY,
CYBER, DIPLO, SUPPLY), a one-line effect naming real actors/places from the
data, a CONDITIONAL likelihood 0-100 (probability this step follows GIVEN the
prior step happened), and a time horizon (e.g. "24-72h", "1-2wk", "1-3mo"). Be
calibrated: deeper steps are generally less certain. Ground everything in the
live data; do not invent breaking events.
Reply with ONLY JSON, no prose:
{"chains":[{"steps":[{"domain":"...","effect":"...","likelihood":NN,"horizon":"..."}]}],"bottom_line":"..."}`

/** Ask the local model to trace a butterfly-effect cascade from a trigger. */
export async function traceCascade(
  model: string,
  trigger: string,
  context: string,
): Promise<Cascade> {
  const messages: ChatMsg[] = [
    { role: 'system', content: CASCADE_SYSTEM },
    {
      role: 'user',
      content: `TRIGGER: ${trigger}\n\nLIVE SITUATION:\n${context}\n\nMap the cascade as JSON:`,
    },
  ]
  const text = await chat(model, messages, { temperature: 0.7 })
  return text == null ? { chains: [], bottomLine: '' } : parseCascade(text)
}
