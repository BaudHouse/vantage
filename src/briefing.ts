// Auto-generated "Daily Briefing" assembled from the live feeds. (Premium
// feature, unlocked.) Pure derivation — no network call.

import type { GeoEvent } from './feeds'
import { conflictByCountry } from './feeds'
import type { Quote } from './markets'
import { sentiment } from './markets'

export interface Briefing {
  date: string
  headline: string
  hotspots: { country: string; count: number }[]
  bullets: string[]
}

export function buildBriefing(events: GeoEvent[], markets: Quote[]): Briefing {
  const byCountry = conflictByCountry(events)
  const hotspots = Object.entries(byCountry)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const quakes = events.filter((e) => e.kind === 'quake')
  const bigQuake = quakes.sort((a, b) => b.weight - a.weight)[0]
  const disasters = events.filter((e) => e.kind === 'disaster')
  const sent = sentiment(markets)
  const gold = markets.find((m) => m.symbol === 'gc.f')
  const oil = markets.find((m) => m.symbol === 'cl.f')

  const top = hotspots[0]
  const headline = top
    ? `${top.country} leads global conflict signal with ${top.count} tracked reports in the last 24h.`
    : 'Global conflict signal is quiet across monitored feeds.'

  const bullets: string[] = []
  if (hotspots.length > 1) {
    bullets.push(
      `Active hotspots: ${hotspots.map((h) => h.country).join(', ')}.`,
    )
  }
  if (bigQuake) {
    bullets.push(`Seismic: ${bigQuake.title}.`)
  }
  if (disasters.length) {
    bullets.push(
      `${disasters.length} satellite-tracked natural events open (NASA EONET).`,
    )
  }
  bullets.push(
    `Defense-sector sentiment reads ${sent}` +
      (gold ? ` · gold ${gold.price.toFixed(0)}` : '') +
      (oil ? ` · WTI ${oil.price.toFixed(1)}` : '') +
      '.',
  )

  return {
    date: new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    headline,
    hotspots,
    bullets,
  }
}

import type { Aircraft, Ship, Camera, Fire, Entity } from './layers'
import { entityTitle } from './layers'

export interface LayerSnapshot {
  aircraft?: Aircraft[]
  ships?: Ship[]
  cameras?: Camera[]
  fires?: Fire[]
  weatherOn?: boolean
}

/** Full multi-INT situation brief fed to the Operator analyst. */
export function situationContext(
  events: GeoEvent[],
  markets: Quote[],
  layers: LayerSnapshot = {},
): string {
  const b = buildBriefing(events, markets)
  const mkt = markets
    .slice(0, 8)
    .map((m) => `${m.name} ${m.price} (${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(1)}%)`)
    .join('; ')

  const quakes = events.filter((e) => e.kind === 'quake')
  const disasters = events.filter((e) => e.kind === 'disaster')
  const lines: string[] = [
    `Date: ${b.date}.`,
    `CONFLICT: ${b.headline} Top hotspots: ${b.hotspots.map((h) => `${h.country}(${h.count})`).join(', ') || 'none'}.`,
    `SEISMIC: ${quakes.length} quakes M2.5+/24h${quakes[0] ? `, strongest ${quakes.sort((a, c) => c.weight - a.weight)[0].title}` : ''}.`,
    `DISASTERS: ${disasters.length} satellite-tracked natural events open (EONET).`,
  ]

  const ac = layers.aircraft ?? []
  if (ac.length) {
    const mil = ac.filter((a) => a.military)
    const emer = ac.filter((a) => a.emergency)
    lines.push(
      `AIR (ADS-B): ${ac.length} tracked, ${mil.length} military${emer.length ? `, ${emer.length} squawking emergency` : ''}.` +
        (mil.length
          ? ` Notable mil: ${mil
              .slice(0, 6)
              .map((a) => `${a.callsign || a.registration || a.acType}${a.acType ? `(${a.acType})` : ''}`)
              .join(', ')}.`
          : ''),
    )
  }

  const ships = layers.ships ?? []
  if (ships.length) {
    const milShips = ships.filter((s) => /military|navy/i.test(s.shipType))
    lines.push(
      `MARITIME (AIS): ${ships.length} vessels${milShips.length ? `, ${milShips.length} military` : ''}.`,
    )
  }

  const fires = layers.fires ?? []
  if (fires.length) {
    lines.push(
      `THERMAL (FIRMS): ${fires.length} active fire detections/24h, strongest ${fires[0]?.frp?.toFixed(0) ?? '?'} MW.`,
    )
  }

  const cams = layers.cameras ?? []
  if (cams.length) lines.push(`TRAFFIC CAMS: ${cams.length} live feeds available.`)
  if (layers.weatherOn) lines.push(`WEATHER: live precipitation radar overlay active.`)

  lines.push(`MARKETS: ${mkt}.`)
  return lines.join('\n')
}

/** Focused context when the user asks the Operator about one tracked entity. */
export function entityContext(e: Entity): string {
  const head = `FOCUS ENTITY (${e.kind}): ${entityTitle(e)} @ ${e.lat.toFixed(3)},${e.lng.toFixed(3)}`
  const json = JSON.stringify(e, null, 0)
  return `${head}\nAttributes: ${json}`
}
