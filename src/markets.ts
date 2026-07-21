// Live markets, no key. Stocks/commodities/forex via the Yahoo Finance chart
// API (keyless) — Stooq's free CSV endpoint went behind a JS proof-of-work +
// removed /q/l/, so it was returning 404 for every symbol. Crypto via CoinGecko.

import { rawFetch } from './net'

const DEV = import.meta.env.DEV
const YAHOO = DEV ? '/feeds/yahoo' : 'https://query1.finance.yahoo.com'
const COINGECKO = DEV ? '/feeds/coingecko' : 'https://api.coingecko.com'
// Yahoo returns cleaner responses (and avoids 401/429) with a browser UA. In the
// browser this header is dropped (forbidden name) but the real browser UA is
// sent anyway; in the Electron main-process fetch it's applied.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

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
  symbol: string // stable id/display key
  yahoo: string // Yahoo Finance ticker to fetch
  name: string
  flag?: string
}

const SPECS: Spec[] = [
  { group: 'defense', symbol: 'lmt.us', yahoo: 'LMT', name: 'Lockheed Martin', flag: '🇺🇸' },
  { group: 'defense', symbol: 'rtx.us', yahoo: 'RTX', name: 'RTX (Raytheon)', flag: '🇺🇸' },
  { group: 'defense', symbol: 'noc.us', yahoo: 'NOC', name: 'Northrop Grumman', flag: '🇺🇸' },
  { group: 'defense', symbol: 'gd.us', yahoo: 'GD', name: 'General Dynamics', flag: '🇺🇸' },
  { group: 'defense', symbol: 'rhm.de', yahoo: 'RHM.DE', name: 'Rheinmetall', flag: '🇩🇪' },
  { group: 'defense', symbol: 'eslt.us', yahoo: 'ESLT', name: 'Elbit Systems', flag: '🇮🇱' },
  { group: 'defense', symbol: 'avav.us', yahoo: 'AVAV', name: 'AeroVironment', flag: '🇺🇸' },
  { group: 'defense', symbol: 'tsm.us', yahoo: 'TSM', name: 'TSMC', flag: '🇹🇼' },
  { group: 'commodity', symbol: 'gc.f', yahoo: 'GC=F', name: 'Gold Futures' },
  { group: 'commodity', symbol: 'cl.f', yahoo: 'CL=F', name: 'Crude Oil (WTI)' },
  { group: 'commodity', symbol: 'ng.f', yahoo: 'NG=F', name: 'Natural Gas' },
  { group: 'commodity', symbol: 'zw.f', yahoo: 'ZW=F', name: 'Wheat Futures' },
  { group: 'commodity', symbol: 'hg.f', yahoo: 'HG=F', name: 'Copper' },
  { group: 'forex', symbol: 'usduah', yahoo: 'UAH=X', name: 'USD/UAH', flag: '🇺🇦' },
  { group: 'forex', symbol: 'usdrub', yahoo: 'RUB=X', name: 'USD/RUB', flag: '🇷🇺' },
  { group: 'forex', symbol: 'usdils', yahoo: 'ILS=X', name: 'USD/ILS', flag: '🇮🇱' },
  { group: 'forex', symbol: 'eurusd', yahoo: 'EURUSD=X', name: 'EUR/USD', flag: '🇪🇺' },
  { group: 'forex', symbol: 'usdcny', yahoo: 'CNY=X', name: 'USD/CNY', flag: '🇨🇳' },
]

async function one(spec: Spec): Promise<Quote | null> {
  try {
    const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(
      spec.yahoo,
    )}?interval=1d&range=1d`
    const r = await rawFetch(url, { ms: 8000, headers: { 'User-Agent': UA } })
    if (!r || !r.ok) return null
    const j = await r.json()
    const meta = j?.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose)
    if (!isFinite(price) || price === 0) return null
    // day-over-day % change (prev session close → current)
    const changePct = isFinite(prev) && prev ? ((price - prev) / prev) * 100 : 0
    return {
      group: spec.group,
      symbol: spec.symbol,
      name: spec.name,
      price,
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
