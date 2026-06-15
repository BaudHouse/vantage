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
  agreement?: number // how many independent drafts supported this chain
}

export interface Cascade {
  chains: CascadeChain[]
  bottomLine: string
  samples?: number // number of drafts reconciled (1 = single pass)
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
    if (steps.length) {
      const agRaw = Number((c as any)?.agreement)
      const chain: CascadeChain = { steps }
      if (Number.isFinite(agRaw) && agRaw > 0) chain.agreement = Math.round(agRaw)
      chains.push(chain)
    }
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
prior step happened), and a time horizon (e.g. "24-72h", "1-2wk", "1-3mo").
Calibration matters: anchor each likelihood on the BASE RATE for that kind of
event (rare/dramatic escalations are low, routine reactions higher), and let
certainty DECAY with depth — a 3rd-order effect should rarely exceed ~50%.
Ground everything in the live data; do not invent breaking events.
Reply with ONLY JSON, no prose:
{"chains":[{"steps":[{"domain":"...","effect":"...","likelihood":NN,"horizon":"..."}]}],"bottom_line":"..."}`

/** Ask the local model to trace a butterfly-effect cascade from a trigger. */
export async function traceCascade(
  model: string,
  trigger: string,
  context: string,
  temperature = 0.7,
): Promise<Cascade> {
  const messages: ChatMsg[] = [
    { role: 'system', content: CASCADE_SYSTEM },
    {
      role: 'user',
      content: `TRIGGER: ${trigger}\n\nLIVE SITUATION:\n${context}\n\nMap the cascade as JSON:`,
    },
  ]
  const text = await chat(model, messages, { temperature })
  return text == null ? { chains: [], bottomLine: '' } : parseCascade(text)
}

const RECONCILE_SYSTEM = `You are VANTAGE's forecasting board reconciling several
INDEPENDENT cascade drafts for the SAME trigger into one calibrated consensus.
Rules:
- Keep the effect chains that RECUR across drafts (convergence = reliability);
  drop one-off speculative chains. Merge near-duplicate chains.
- For each step, set the conditional likelihood to the calibrated CONSENSUS —
  roughly the average across the drafts that included it — then sanity-check it
  against base rates: rare/dramatic steps stay low, and likelihood should decay
  with depth. Do NOT just copy the most aggressive draft.
- Set each chain's "agreement" to how many of the N drafts supported it.
- Order chains by reliability (agreement) then severity.
Reply with ONLY JSON, no prose:
{"chains":[{"agreement":N,"steps":[{"domain":"...","effect":"...","likelihood":NN,"horizon":"..."}]}],"bottom_line":"..."}`

function draftToJson(c: Cascade): string {
  return JSON.stringify({
    chains: c.chains.map((ch) => ({
      steps: ch.steps.map((s) => ({
        domain: s.domain,
        effect: s.effect,
        likelihood: s.likelihood,
        horizon: s.horizon,
      })),
    })),
  })
}

export interface EnsembleOpts {
  samples?: number
  onProgress?: (msg: string) => void
}

/**
 * Highest-accuracy cascade: draw `samples` independent drafts (self-consistency)
 * then reconcile them into one calibrated consensus, so recurring chains are
 * kept, likelihoods are averaged + base-rate-checked, and each chain carries an
 * agreement count. Falls back to a single draft if the model is flaky.
 */
export async function traceCascadeEnsemble(
  model: string,
  trigger: string,
  context: string,
  opts: EnsembleOpts = {},
): Promise<Cascade> {
  const K = Math.max(1, Math.min(5, opts.samples ?? 3))
  const prog = opts.onProgress ?? (() => {})

  const drafts: Cascade[] = []
  for (let i = 0; i < K; i++) {
    prog(`drafting scenario ${i + 1} of ${K}…`)
    // vary temperature a touch per draft for genuine diversity
    const c = await traceCascade(model, trigger, context, 0.65 + i * 0.1)
    if (c.chains.length) drafts.push(c)
  }
  if (!drafts.length) return { chains: [], bottomLine: '', samples: 0 }
  if (drafts.length === 1) return { ...drafts[0], samples: 1 }

  prog(`reconciling ${drafts.length} scenarios…`)
  const draftBlock = drafts
    .map((d, i) => `DRAFT ${i + 1}:\n${draftToJson(d)}`)
    .join('\n\n')
  const text = await chat(
    model,
    [
      { role: 'system', content: RECONCILE_SYSTEM },
      {
        role: 'user',
        content: `TRIGGER: ${trigger}\nN = ${drafts.length} drafts.\n\n${draftBlock}\n\nReturn the reconciled consensus JSON:`,
      },
    ],
    { temperature: 0.25 },
  )
  const merged = text ? parseCascade(text) : { chains: [], bottomLine: '' }
  if (!merged.chains.length) return { ...drafts[0], samples: drafts.length }
  return { ...merged, samples: drafts.length }
}
