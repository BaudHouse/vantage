// Prediction-market style questions. No backend: each market has a seed
// crowd position; the user's own YES/NO vote is persisted in localStorage and
// nudges the displayed odds. (All "premium" voting features unlocked.)

export type PredCategory = 'MIL' | 'GEO' | 'ECON' | 'CIVIL'

export interface Market {
  id: string
  category: PredCategory
  question: string
  /** seed probability of YES, 0..100 */
  seedYes: number
  seedVotes: number
  resolves: string // ISO date
  generated?: boolean // true = proposed by the AI from the live feed
}

export const MARKETS: Market[] = [
  { id: 'ua-ceasefire', category: 'MIL', seedYes: 12, seedVotes: 806,
    question: 'Will there be a ceasefire in Ukraine before July 2026?', resolves: '2026-07-01' },
  { id: 'taiwan-blockade', category: 'MIL', seedYes: 18, seedVotes: 540,
    question: 'Will China impose a naval blockade on Taiwan in 2026?', resolves: '2026-12-31' },
  { id: 'nato-art5', category: 'GEO', seedYes: 7, seedVotes: 311,
    question: 'Will NATO invoke Article 5 before 2027?', resolves: '2027-01-01' },
  { id: 'iran-nuke', category: 'MIL', seedYes: 23, seedVotes: 689,
    question: 'Will Iran announce a nuclear weapon test by end of 2026?', resolves: '2026-12-31' },
  { id: 'oil-120', category: 'ECON', seedYes: 31, seedVotes: 472,
    question: 'Will Brent crude close above $120 at any point in 2026?', resolves: '2026-12-31' },
  { id: 'sudan-truce', category: 'CIVIL', seedYes: 28, seedVotes: 198,
    question: 'Will a durable truce hold in Sudan through Q3 2026?', resolves: '2026-09-30' },
  { id: 'sk-escalation', category: 'MIL', seedYes: 15, seedVotes: 257,
    question: 'Will North Korea conduct an ICBM test in the next 90 days?', resolves: '2026-08-30' },
  { id: 'gold-5k', category: 'ECON', seedYes: 44, seedVotes: 613,
    question: 'Will gold close above $5,000/oz in 2026?', resolves: '2026-12-31' },
]

// --- AI-generated markets (proposed from the live feed) --------------------
const GEN_KEY = 'vantage.genmarkets.v1'

export function loadGenerated(): Market[] {
  try {
    const arr = JSON.parse(localStorage.getItem(GEN_KEY) || '[]')
    return Array.isArray(arr) ? (arr as Market[]) : []
  } catch {
    return []
  }
}

export function saveGenerated(markets: Market[]): void {
  try {
    localStorage.setItem(GEN_KEY, JSON.stringify(markets.slice(0, 12)))
  } catch {
    /* best-effort */
  }
}

/** Build durable Market rows from AI proposals (id, resolution date, votes). */
export function buildGeneratedMarkets(
  proposals: { category: PredCategory; question: string; seedYes: number }[],
  now: number,
): Market[] {
  const resolves = new Date(now + 120 * 86_400_000).toISOString().slice(0, 10)
  return proposals.map((p, i) => ({
    id: `gen-${now}-${i}`,
    category: p.category,
    question: p.question,
    seedYes: p.seedYes,
    seedVotes: 20 + ((now + i) % 80),
    resolves,
    generated: true,
  }))
}

const KEY = 'vantage.votes.v1'

type Votes = Record<string, 'yes' | 'no'>

export function getVotes(): Votes {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function castVote(id: string, side: 'yes' | 'no'): Votes {
  const v = getVotes()
  if (v[id] === side) delete v[id]
  else v[id] = side
  localStorage.setItem(KEY, JSON.stringify(v))
  return v
}

export interface MarketView extends Market {
  yes: number
  no: number
  votes: number
  myVote?: 'yes' | 'no'
  daysLeft: number
}

export function view(m: Market, votes: Votes): MarketView {
  const my = votes[m.id]
  // user's vote shifts the crowd a touch, like a real thin market
  let yes = m.seedYes
  let count = m.seedVotes
  if (my === 'yes') { yes = Math.min(99, m.seedYes + 3); count++ }
  if (my === 'no') { yes = Math.max(1, m.seedYes - 3); count++ }
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(m.resolves) - Date.now()) / 86_400_000),
  )
  return { ...m, yes, no: 100 - yes, votes: count, myVote: my, daysLeft }
}
