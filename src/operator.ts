// "Operator Chat" — AI intelligence analyst backed by a local Ollama model.
// Degrades gracefully when Ollama isn't installed/running yet (it downloads in
// the background). Dev routes through the Vite proxy; packaged build hits the
// loopback API directly.

const DEV = import.meta.env.DEV
const OLLAMA = DEV ? '/ollama' : 'http://127.0.0.1:11434'

const PREFERRED = ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:3b', 'llama3.2']

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function ollamaModel(): Promise<string | null> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
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

/** Ask the local model to forecast a single prediction-market question. */
export async function forecastMarket(
  model: string,
  question: string,
  context: string,
): Promise<Forecast | null> {
  try {
    const messages: ChatMsg[] = [
      { role: 'system', content: FORECAST_SYSTEM },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nLIVE SITUATION:\n${context}\n\nYour calibrated assessment:`,
      },
    ]
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.5 },
      }),
    })
    if (!r.ok) return null
    const j = await r.json()
    const text: string = j?.message?.content ?? ''
    const m = text.match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/)
    const probability = m
      ? Math.max(1, Math.min(99, Number(m[1])))
      : 50
    const rationale = text.replace(/P:\s*[0-9.]+\s*%?/i, '').trim()
    return { probability, rationale }
  } catch {
    return null
  }
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
  try {
    const messages: ChatMsg[] = [
      { role: 'system', content: `${SYSTEM}\n\nCURRENT SITUATION:\n${context}` },
      ...history,
    ]
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    })
    if (!r.ok) return null
    const j = await r.json()
    return j?.message?.content ?? null
  } catch {
    return null
  }
}
