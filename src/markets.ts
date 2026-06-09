// Live markets via Stooq free CSV quotes (no key). One request per symbol
// (Stooq's multi-symbol light endpoint mangles output), fetched in parallel.

import { rawFetch } from './net'

const DEV = import.meta.env.DEV
const STOOQ = DEV ? '/feeds/stooq' : 'https://stooq.com'
const COINGECKO = DEV ? '/feeds/coingecko' : 'https://api.coingecko.com'

export type QuoteGroup = 'defense' | 'commodity' | 'forex' | 'crypto'

export interface Quote {
  group: QuoteGroup
  symbol: string
  name: string
  price: number
  changePct: number // intraday open->close %
  flag?: string
}

interface Spec {
  group: QuoteGroup
  symbol: string
  name: string
  flag?: string
}

const SPECS: Spec[] = [
  { group: 'defense', symbol: 'lmt.us', name: 'Lockheed Martin', flag: '🇺🇸' },
  { group: 'defense', symbol: 'rtx.us', name: 'RTX (Raytheon)', flag: '🇺🇸' },
  { group: 'defense', symbol: 'noc.us', name: 'Northrop Grumman', flag: '🇺🇸' },
  { group: 'defense', symbol: 'gd.us', name: 'General Dynamics', flag: '🇺🇸' },
  { group: 'defense', symbol: 'rhm.de', name: 'Rheinmetall', flag: '🇩🇪' },
  { group: 'defense', symbol: 'eslt.us', name: 'Elbit Systems', flag: '🇮🇱' },
  { group: 'defense', symbol: 'avav.us', name: 'AeroVironment', flag: '🇺🇸' },
  { group: 'defense', symbol: 'tsm.us', name: 'TSMC', flag: '🇹🇼' },
  { group: 'commodity', symbol: 'gc.f', name: 'Gold Futures' },
  { group: 'commodity', symbol: 'cl.f', name: 'Crude Oil (WTI)' },
  { group: 'commodity', symbol: 'ng.f', name: 'Natural Gas' },
  { group: 'commodity', symbol: 'zw.f', name: 'Wheat Futures' },
  { group: 'commodity', symbol: 'hg.f', name: 'Copper' },
  { group: 'forex', symbol: 'usduah', name: 'USD/UAH', flag: '🇺🇦' },
  { group: 'forex', symbol: 'usdrub', name: 'USD/RUB', flag: '🇷🇺' },
  { group: 'forex', symbol: 'usdils', name: 'USD/ILS', flag: '🇮🇱' },
  { group: 'forex', symbol: 'eurusd', name: 'EUR/USD', flag: '🇪🇺' },
  { group: 'forex', symbol: 'usdcny', name: 'USD/CNY', flag: '🇨🇳' },
]

async function one(spec: Spec): Promise<Quote | null> {
  try {
    const url = `${STOOQ}/q/l/?s=${spec.symbol}&f=sd2t2ohlc&h&e=csv`
    const r = await rawFetch(url, { ms: 7000 })
    if (!r || !r.ok) return null
    const txt = await r.text()
    const lines = txt.trim().split('\n')
    if (lines.length < 2) return null
    const cols = lines[1].split(',')
    // Symbol,Date,Time,Open,High,Low,Close
    const open = parseFloat(cols[3])
    const close = parseFloat(cols[6])
    if (!isFinite(close) || close === 0) return null
    const changePct = isFinite(open) && open ? ((close - open) / open) * 100 : 0
    return {
      group: spec.group,
      symbol: spec.symbol,
      name: spec.name,
      price: close,
      changePct,
      flag: spec.flag,
    }
  } catch {
    return null
  }
}

const CRYPTO: { id: string; name: string }[] = [
  { id: 'bitcoin', name: 'Bitcoin' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'solana', name: 'Solana' },
  { id: 'tether-gold', name: 'Tether Gold' },
]

async function fetchCrypto(): Promise<Quote[]> {
  try {
    const ids = CRYPTO.map((c) => c.id).join(',')
    const r = await rawFetch(
      `${COINGECKO}/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { ms: 8000 },
    )
    if (!r || !r.ok) return []
    const j = await r.json()
    return CRYPTO.flatMap((c) => {
      const d = j?.[c.id]
      if (!d || typeof d.usd !== 'number') return []
      return [{
        group: 'crypto' as const,
        symbol: c.id,
        name: c.name,
        price: d.usd,
        changePct: Number(d.usd_24h_change ?? 0),
        flag: '₿',
      }]
    })
  } catch {
    return []
  }
}

export async function fetchMarkets(): Promise<Quote[]> {
  const [stocks, crypto] = await Promise.all([
    Promise.all(SPECS.map(one)),
    fetchCrypto(),
  ])
  return [...stocks.filter((q): q is Quote => q !== null), ...crypto]
}

/** Overall market sentiment from defense-stock breadth. */
export function sentiment(quotes: Quote[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const d = quotes.filter((q) => q.group === 'defense')
  if (!d.length) return 'NEUTRAL'
  const avg = d.reduce((s, q) => s + q.changePct, 0) / d.length
  if (avg > 0.4) return 'BULLISH'
  if (avg < -0.4) return 'BEARISH'
  return 'NEUTRAL'
}
