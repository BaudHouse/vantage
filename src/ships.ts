// Live vessels via AISStream.io — free, but needs an API key
// (https://aisstream.io/). Set VITE_AISSTREAM_KEY in .env.local. It's a
// websocket stream, so we connect on demand, keep a rolling snapshot of the
// most recent position per MMSI, and expire stale contacts. Without a key the
// layer is a no-op and the UI flags it.

import type { Ship } from './layers'
import { getKey } from './net'

const aisKey = (): string | undefined => getKey('VITE_AISSTREAM_KEY')

export function shipsEnabled(): boolean {
  return !!aisKey()
}

// AIS ship-type code -> readable class (coarse buckets).
function shipTypeName(code: number): string {
  if (code >= 20 && code <= 29) return 'Wing-in-ground'
  if (code === 30) return 'Fishing'
  if (code === 31 || code === 32 || code === 52) return 'Tug'
  if (code === 35) return 'Military'
  if (code === 36) return 'Sailing'
  if (code === 37) return 'Pleasure craft'
  if (code >= 40 && code <= 49) return 'High-speed craft'
  if (code >= 60 && code <= 69) return 'Passenger'
  if (code >= 70 && code <= 79) return 'Cargo'
  if (code >= 80 && code <= 89) return 'Tanker'
  return 'Vessel'
}

const NAV_STATUS: Record<number, string> = {
  0: 'Under way (engine)', 1: 'At anchor', 2: 'Not under command',
  3: 'Restricted manoeuvrability', 4: 'Constrained by draught', 5: 'Moored',
  6: 'Aground', 7: 'Fishing', 8: 'Under way (sailing)',
}

interface Contact extends Ship {
  ts: number
}

const fleet = new Map<string, Contact>()
let ws: WebSocket | null = null
let wanted = false // the ship layer is on and we should stay connected
let reconnectAt = 0 // backoff timer handle
let backoff = 2000

// Global-ish bounding boxes covering the major maritime theatres.
const BOXES = [
  [[-80, -180], [85, 180]], // world (AISStream accepts one big box)
]

export function connectShips() {
  if (!aisKey()) return
  wanted = true
  openSocket()
}

function openSocket() {
  const key = aisKey()
  if (!key || !wanted || ws) return // never open a second socket
  try {
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    ws.onopen = () => {
      backoff = 2000 // reset backoff on a healthy connection
      ws?.send(
        JSON.stringify({
          APIKey: key,
          BoundingBoxes: BOXES,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }),
      )
    }
    ws.onmessage = async (ev) => {
      try {
        // AISStream delivers frames as Blobs, not strings.
        const raw: string =
          typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
        const msg = JSON.parse(raw)
        const meta = msg?.MetaData ?? {}
        const mmsi = String(meta?.MMSI ?? '')
        if (!mmsi) return
        const lat = Number(meta?.latitude)
        const lng = Number(meta?.longitude)
        const prev = fleet.get(mmsi)
        if (msg?.MessageType === 'PositionReport') {
          const pr = msg?.Message?.PositionReport ?? {}
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          fleet.set(mmsi, {
            kind: 'ship',
            id: mmsi,
            lat,
            lng,
            name: prev?.name ?? (meta?.ShipName ?? '').toString().trim(),
            shipType: prev?.shipType ?? 'Vessel',
            flag: prev?.flag ?? '',
            speed: Number(pr?.Sog ?? 0),
            heading: Number(pr?.Cog ?? pr?.TrueHeading ?? 0),
            destination: prev?.destination ?? '',
            navStatus: NAV_STATUS[Number(pr?.NavigationalStatus)] ?? '',
            ts: Date.now(),
          })
        } else if (msg?.MessageType === 'ShipStaticData' && prev) {
          const sd = msg?.Message?.ShipStaticData ?? {}
          prev.name = (sd?.Name ?? prev.name ?? '').toString().trim()
          prev.shipType = shipTypeName(Number(sd?.Type ?? 0))
          prev.destination = (sd?.Destination ?? '').toString().trim()
        }
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      ws = null
      // Auto-reconnect with capped backoff while the layer is still on.
      if (wanted) {
        clearTimeout(reconnectAt)
        reconnectAt = setTimeout(openSocket, backoff) as unknown as number
        backoff = Math.min(backoff * 2, 30_000)
      }
    }
    ws.onerror = () => {
      try {
        ws?.close()
      } catch {
        /* onclose handles reconnect */
      }
    }
  } catch {
    ws = null
  }
}

export function disconnectShips() {
  wanted = false
  clearTimeout(reconnectAt)
  try {
    ws?.close()
  } catch {
    /* noop */
  }
  ws = null
}

/** Snapshot of vessels seen in the last 10 minutes, capped for legibility. */
export function getShips(): Ship[] {
  const cutoff = Date.now() - 10 * 60_000
  const live: Ship[] = []
  for (const [mmsi, c] of fleet) {
    if (c.ts < cutoff) {
      fleet.delete(mmsi)
      continue
    }
    live.push(c)
  }
  return live.slice(0, 600)
}
