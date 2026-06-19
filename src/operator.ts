// "Operator Chat" — AI intelligence analyst backed by a local Ollama model.
// Degrades gracefully when Ollama isn't installed/running yet (it downloads in
// the background). Dev routes through the Vite proxy; packaged build hits the
// loopback API directly.

import { rawFetch } from './net'
import { firstBalanced } from './jsonx'

const DEV = import.meta.env.DEV
const OLLAMA = DEV ? '/ollama' : 'http://127.0.0.1:11434'

const PREFERRED = ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:3b', 'llama3.2']

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[] // base64 frames, for vision models
}

// ---- single-flight queue --------------------------------------------------
// Every chat call funnels through one promise chain. A local Ollama generates
// one response at a time (OLLAMA_NUM_PARALLEL defaults to 1); firing requests
// concurrently just parks the extras in Ollama's queue while their CLIENT
// timeouts keep ticking — so the third simultaneous caller (auto-seed + trends
// assess + briefing outlook) times out spuriously. Serializing client-side
// makes each call's timeout measure its own generation only.

let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

interface ChatOpts {
  temperature?: number
  numCtx?: number
  ms?: number
}

/** One queued POST /api/chat round-trip; returns assistant text or null. */
export async function chat(
  model: string,
  messages: ChatMsg[],
  opts: ChatOpts = {},
): Promise<string | null> {
  return enqueue(async () => {
    try {
      const options: Record<string, number> = {}
      if (opts.temperature !== undefined) options.temperature = opts.temperature
      if (opts.numCtx !== undefined) options.num_ctx = opts.numCtx
      const body: Record<string, unknown> = { model, messages, stream: false }
      if (Object.keys(options).length) body.options = options
      const r = await rawFetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ms: opts.ms ?? 120000,
      })
      if (!r || !r.ok) return null
      const j = await r.json()
      return (j?.message?.content as string) ?? null
    } catch {
      return null
    }
  })
}

export async function ollamaModel(): Promise<string | null> {
  try {
    const r = await rawFetch(`${OLLAMA}/api/tags`, { ms: 2500 })
    if (!r || !r.ok) return null
    const j = await r.json()
    const names: string[] = (j?.models ?? []).map((m: any) => m.name)
    if (!names.length) return null
    for (const p of PREFERRED) {
      const hit = names.find((n) => n === p || n.startsWith(p))
      if (hit) return hit
    }
    return names[0]
  } catch {
    return null
  }
}

// Vision-capable Ollama models, in preference order.
const VISION_MODELS = [
  'qwen2.5vl', 'qwen2-vl', 'llama3.2-vision', 'llava-llama3', 'llava',
  'minicpm-v', 'bakllava', 'moondream',
]

/**
 * Installed GENERAL chat models (excludes vision + embedding models), strongest
 * first. Used to draft the cascade ensemble across architecturally-different
 * models so the drafts are genuinely independent, not just temperature-varied.
 */
export async function chatModels(): Promise<string[]> {
  try {
    const r = await rawFetch(`${OLLAMA}/api/tags`, { ms: 2500 })
    if (!r || !r.ok) return []
    const j = await r.json()
    const names: string[] = (j?.models ?? [])
      .map((m: any) => m.name as string)
      .filter(
        (n: string) =>
          !/embed|nomic|vl|vision|llava|minicpm|bakllava|moondream/i.test(n),
      )
    const ordered: string[] = []
    for (const p of PREFERRED) {
      const hit = names.find((n) => n === p || n.startsWith(p))
      if (hit && !ordered.includes(hit)) ordered.push(hit)
    }
    for (const n of names) if (!ordered.includes(n)) ordered.push(n)
    return ordered
  } catch {
    return []
  }
}

/** Find an installed embedding model (e.g. nomic-embed-text), or null. */
export async function embedModel(): Promise<string | null> {
  try {
    const r = await rawFetch(`${OLLAMA}/api/tags`, { ms: 2500 })
    if (!r || !r.ok) return null
    const j = await r.json()
    const names: string[] = (j?.models ?? []).map((m: any) => m.name)
    return names.find((n) => /embed/i.test(n)) ?? null
  } catch {
    return null
  }
}

/** Embed a batch of texts; returns one vector per input, or null on failure. */
export async function embed(
  model: string,
  input: string[],
): Promise<number[][] | null> {
  if (!input.length) return []
  try {
    const r = await rawFetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
      ms: 30000,
    })
    if (!r || !r.ok) return null
    const j = await r.json()
    const e = j?.embeddings
    return Array.isArray(e) && e.length === input.length ? e : null
  } catch {
    return null
  }
}

export async function visionModel(): Promise<string | null> {
  try {
    const r = await rawFetch(`${OLLAMA}/api/tags`, { ms: 2500 })
    if (!r || !r.ok) return null
    const j = await r.json()
    const names: string[] = (j?.models ?? []).map((m: any) => m.name)
    for (const v of VISION_MODELS) {
      const hit = names.find((n) => n.toLowerCase().includes(v))
      if (hit) return hit
    }
    return null
  } catch {
    return null
  }
}

const VISION_SYSTEM = `You are VANTAGE Operator analyzing a live camera frame for
situational awareness. Report ONLY what is visible. Cover, where applicable:
traffic flow/congestion, road/surface conditions, weather & visibility, daylight/
night, pedestrians/crowd activity, vehicles of note, any incident, hazard, or
anomaly, and an overall one-line assessment. Be specific and concise; never
invent detail you cannot see.`

/** Send a camera frame (base64) to the local vision model for analysis. */
export async function analyzeImage(
  model: string,
  imageBase64: string,
  context: string,
): Promise<string | null> {
  return chat(
    model,
    [
      { role: 'system', content: VISION_SYSTEM },
      { role: 'user', content: context, images: [imageBase64] },
    ],
    { temperature: 0.3, ms: 180000 },
  )
}

const AREA_SYSTEM = `You are VANTAGE Operator producing a SITUATIONAL REPORT from
several live cameras in one area. The images are separate cameras, named in order
in the prompt. For each, note key observations (traffic, weather, activity,
anomalies). Then give an OVERALL AREA ASSESSMENT and a one-line BOTTOM LINE.
Be concise and structured (use the camera names as headers). Report only what is
visible across the frames.`

/** Analyze several camera frames at once into a combined area report. */
export async function analyzeArea(
  model: string,
  images: string[],
  context: string,
): Promise<string | null> {
  return chat(
    model,
    [
      { role: 'system', content: AREA_SYSTEM },
      { role: 'user', content: context, images },
    ],
    // Several images + a structured report need a big context window;
    // Ollama's default is too small and silently truncates/errors.
    { temperature: 0.3, numCtx: 16384, ms: 240000 },
  )
}

const SYSTEM = `You are VANTAGE Operator — a senior all-source intelligence analyst
running point on a live global common operating picture. Your feeds: GDELT
conflict wire, USGS seismic, NASA EONET disasters, NASA FIRMS thermal/fire
detections, live ADS-B aircraft (incl. military), AIS vessels, traffic cameras,
RainViewer weather radar, and defense/commodity/FX markets.

Tradecraft:
- Lead with the BLUF (bottom line up front), then supporting detail.
- Fuse across feeds — correlate, don't just list. E.g. military air activity +
  conflict wire + market moves around the same region is a stronger signal than
  any one alone.
- Distinguish FACT (in the data you were given) from ASSESSMENT (your inference),
  and give a confidence (low/moderate/high) on assessments.
- Quantify when you can (counts, headings, altitudes, % moves). Cite the feed.
- Flag intelligence gaps and what collection would resolve them.
- Never fabricate casualties, named units, or breaking events not in the data.
- Be terse and structured. Default under ~200 words unless asked to go deep.

When asked about a specific tracked entity, treat its attributes as ground truth
and reason about what it implies (mission profile, route, anomaly, escalation).`

const FORECAST_SYSTEM = `You are VANTAGE's forecasting analyst. Given a yes/no
geopolitical question and the live situation, give a calibrated probability the
answer is YES. Be brief: 2-3 sentences of reasoning grounded in the data, then a
final line EXACTLY in the form "P: NN%". Anchor on base rates; rare dramatic
events should get low probabilities unless the data clearly supports otherwise.`

export interface Forecast {
  probability: number // 0..100
  rationale: string
}

const ASSESS_SYSTEM = `You are VANTAGE's early-warning analyst. You are handed a
list of metrics that just spiked abnormally above their baseline, plus the live
global situation. Some spikes include a NEURAL FORECAST (a small net trained on
the metric's own history projecting the next few values) — when present, use it
to judge whether the spike is still building or already easing, and factor in
how much it beats a naive baseline. For each spike, state in one tight sentence
the most likely driver and the probable near-term development to watch for. Lead
with the most consequential. Be concrete and grounded; if a spike looks like
benign noise or a data artefact, say so. End with a one-line BOTTOM LINE. Use
short markdown bullets. Keep the whole thing under ~130 words.`

const OUTLOOK_SYSTEM = `You are VANTAGE's forecasting desk. From the live global
situation, give a concise forward look: the 3-5 most probable developments over
the next 24-72 hours. Each is one markdown bullet that STARTS with a likelihood
tag — **Likely** / **Possible** / **Watch** — and names real actors/places from
the data. End with a one-line "BOTTOM LINE:". Keep it under ~110 words. Be
calibrated and sober; anchor on base rates and avoid sensationalism.`

/** Strategic forward forecast: probable developments over the next 24-72h. */
export async function forecastOutlook(
  model: string,
  context: string,
): Promise<string | null> {
  return chat(
    model,
    [
      { role: 'system', content: OUTLOOK_SYSTEM },
      {
        role: 'user',
        content: `LIVE SITUATION:\n${context}\n\nForward look (next 24-72h):`,
      },
    ],
    { temperature: 0.5 },
  )
}

/** Ask the model to interpret a set of detected anomalies / developing spikes. */
export async function assessSituations(
  model: string,
  spikes: string[],
  context: string,
): Promise<string | null> {
  return chat(
    model,
    [
      { role: 'system', content: ASSESS_SYSTEM },
      {
        role: 'user',
        content: `DEVELOPING SPIKES (metric: current vs baseline):\n${spikes
          .map((s) => `- ${s}`)
          .join('\n')}\n\nLIVE SITUATION:\n${context}\n\nAssess:`,
      },
    ],
    { temperature: 0.4 },
  )
}

/** Ask the local model to forecast a single prediction-market question. */
export async function forecastMarket(
  model: string,
  question: string,
  context: string,
): Promise<Forecast | null> {
  const text = await chat(
    model,
    [
      { role: 'system', content: FORECAST_SYSTEM },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nLIVE SITUATION:\n${context}\n\nYour calibrated assessment:`,
      },
    ],
    { temperature: 0.5 },
  )
  if (text == null) return null
  // Anchor on the labeled answer "P: NN%" the prompt asks for; only fall back
  // to a bare percentage (the LAST one — closest to the conclusion) if absent,
  // so a reasoning figure earlier in the text isn't mistaken for the answer.
  const labeled = text.match(/P:\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%?/i)
  let pct: number | null = labeled ? Number(labeled[1]) : null
  if (pct == null) {
    const all = [...text.matchAll(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/g)]
    if (all.length) pct = Number(all[all.length - 1][1])
  }
  const probability = pct != null ? Math.max(1, Math.min(99, pct)) : 50
  const rationale = text.replace(/P:\s*[0-9.]+\s*%?/i, '').trim()
  return { probability, rationale }
}

const PROPOSE_SYSTEM = `You are VANTAGE's forecasting desk. From the LIVE global
situation, invent NEW, specific, falsifiable YES/NO forecasting questions about
what may happen in the next 1-6 months. Ground every question in the actual
events shown — name real places/actors from the data, not generic scenarios.
Each needs an unambiguous resolution. Do NOT repeat any of these existing
questions: {EXISTING}.
Reply with ONLY a JSON array (no prose) of 3-5 objects, each exactly:
{"category":"MIL"|"GEO"|"ECON"|"CIVIL","question":"...","seedYes":<0-100 int>}.`

export interface ProposedMarket {
  category: 'MIL' | 'GEO' | 'ECON' | 'CIVIL'
  question: string
  seedYes: number
}

const CATS = new Set(['MIL', 'GEO', 'ECON', 'CIVIL'])

/** Pull a clean ProposedMarket[] out of a (possibly messy) model response. */
export function parseProposed(text: string): ProposedMarket[] {
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    const span = firstBalanced(text, '[', ']') ?? firstBalanced(text, '{', '}')
    if (span) {
      try {
        data = JSON.parse(span)
      } catch {
        return []
      }
    }
  }
  // Ollama's JSON mode may wrap the array in an object; dig out the first array.
  let arr: unknown = data
  if (data && !Array.isArray(data) && typeof data === 'object') {
    arr = Object.values(data as Record<string, unknown>).find(Array.isArray) ?? []
  }
  if (!Array.isArray(arr)) return []
  const out: ProposedMarket[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const category = String(o.category ?? '').toUpperCase()
    const question = String(o.question ?? '').trim()
    if (!CATS.has(category) || question.length < 12) continue
    let seedYes = Number(o.seedYes)
    if (!Number.isFinite(seedYes)) seedYes = 25
    seedYes = Math.max(1, Math.min(99, Math.round(seedYes)))
    out.push({ category: category as ProposedMarket['category'], question, seedYes })
    if (out.length >= 5) break
  }
  return out
}

/** Ask the local model to propose fresh prediction questions from live state. */
export async function proposeMarkets(
  model: string,
  context: string,
  existing: string[],
): Promise<ProposedMarket[]> {
  const sys = PROPOSE_SYSTEM.replace('{EXISTING}', existing.slice(0, 10).join(' | '))
  // NOTE: deliberately NOT using Ollama's format:'json' here — for a top-level
  // array it collapses the items into one flat object with duplicate keys.
  // Plain generation yields a real JSON array, which parseProposed extracts
  // (it also recovers an array embedded in any stray prose).
  const text = await chat(
    model,
    [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `LIVE SITUATION:\n${context}\n\nReturn the JSON array now:`,
      },
    ],
    { temperature: 0.8 },
  )
  return parseProposed(text ?? '')
}

/**
 * Send a turn to the analyst. `context` is a compact situation summary built
 * from the live feeds so the model can reason over current state.
 * Returns the assistant text, or null if Ollama is unavailable.
 */
export async function askOperator(
  model: string,
  history: ChatMsg[],
  context: string,
): Promise<string | null> {
  return chat(model, [
    { role: 'system', content: `${SYSTEM}\n\nCURRENT SITUATION:\n${context}` },
    ...history,
  ])
}
