// Network + secrets abstraction.
//
// • In the browser / Vite dev + preview, requests go through window.fetch and
//   the Vite proxy (see vite.config.ts), exactly as before.
// • In a packaged Electron build, window.vantage (exposed by electron/preload.cjs)
//   is present: requests are forwarded to the MAIN process, which fetches with
//   Node (no CORS, no mixed-content), so the renderer can keep webSecurity ON.
//   Keys are read at runtime from the main process — never baked into the bundle.

interface Bridge {
  netFetch?: (req: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    ms?: number
  }) => Promise<{ ok: boolean; status: number; text: string }>
  fetchImage?: (url: string) => Promise<string | null>
  keys?: Record<string, string>
}

const bridge: Bridge | undefined = (globalThis as { vantage?: Bridge }).vantage

export const IS_ELECTRON = !!bridge?.netFetch

export interface RawOpts {
  method?: string
  headers?: Record<string, string>
  body?: string
  ms?: number
}

// ---- feed concurrency gate (dev/browser only) -----------------------------
// In dev every feed is proxied through ONE origin (localhost:5174), so the
// browser's ~6-connections-per-origin cap means a slow feed (ISS ~10s) can pin
// slots while OTHER feeds sit queued — with their abort timers already ticking,
// so they spuriously time out and their layer blanks to 0 (the "flicker").
// Gate feed fetches to a handful in-flight AND start each request's timer only
// AFTER it acquires a slot, so a timeout measures the request, not the wait.
// Ollama (own single-flight queue, minutes-long) and the Electron main-process
// path (no per-origin cap) are exempt.
const FEED_LIMIT = 5
let active = 0
const waiters: (() => void)[] = []
function acquire(): Promise<void> {
  if (active < FEED_LIMIT) {
    active++
    return Promise.resolve()
  }
  return new Promise<void>((res) => waiters.push(res)) // slot handed over on release
}
function release(): void {
  const next = waiters.shift()
  if (next) next() // transfer the slot directly (active unchanged)
  else active--
}

/** Low-level fetch with a hard timeout. Routes through Electron main in prod. */
export async function rawFetch(
  url: string,
  opts: RawOpts = {},
): Promise<Response | null> {
  const { method = 'GET', headers, body, ms = 9000 } = opts
  if (bridge?.netFetch) {
    try {
      // Forward `ms` so the main process honors the caller's timeout (e.g. the
      // 5-min cascade ceiling) instead of a fixed cap — see electron/main.cjs.
      const r = await bridge.netFetch({ url, method, headers, body, ms })
      return new Response(r.text, { status: r.status })
    } catch {
      return null
    }
  }
  // Ollama has its own single-flight queue and long timeouts — never gate it.
  const gated = !url.startsWith('/ollama') && !url.includes(':11434')
  if (gated) await acquire()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { method, headers, body, signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(t)
    if (gated) release()
  }
}

export type KeyName =
  | 'VITE_FIRMS_KEY'
  | 'VITE_AISSTREAM_KEY'
  | 'VITE_WAQI_KEY'
  | 'VITE_WINDY_KEY'

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Fetch any image and return raw base64 (no data: prefix) — for feeding camera
 *  frames to the local vision model. Electron uses the main process; dev uses
 *  the /imgproxy middleware so cross-origin/no-CORS hosts still work. */
export async function fetchImageBase64(url: string): Promise<string | null> {
  if (bridge?.fetchImage) return bridge.fetchImage(url)
  try {
    const r = await fetch(`/imgproxy?url=${encodeURIComponent(url)}`)
    if (!r.ok) return null
    return bufToBase64(await r.arrayBuffer())
  } catch {
    return null
  }
}

/** Read an API key at runtime — from the Electron main process if present,
 *  else from Vite env (static access so Vite can inline it in dev). */
export function getKey(name: KeyName): string | undefined {
  const fromBridge = bridge?.keys?.[name]
  if (fromBridge) return fromBridge
  // Static accesses so Vite can inline each in the dev/browser build.
  if (name === 'VITE_FIRMS_KEY') return import.meta.env.VITE_FIRMS_KEY
  if (name === 'VITE_AISSTREAM_KEY') return import.meta.env.VITE_AISSTREAM_KEY
  if (name === 'VITE_WAQI_KEY') return import.meta.env.VITE_WAQI_KEY
  if (name === 'VITE_WINDY_KEY') return import.meta.env.VITE_WINDY_KEY
  return undefined
}
