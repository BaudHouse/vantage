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

/** Low-level fetch with a hard timeout. Routes through Electron main in prod. */
export async function rawFetch(
  url: string,
  opts: RawOpts = {},
): Promise<Response | null> {
  const { method = 'GET', headers, body, ms = 9000 } = opts
  if (bridge?.netFetch) {
    try {
      const r = await bridge.netFetch({ url, method, headers, body })
      return new Response(r.text, { status: r.status })
    } catch {
      return null
    }
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { method, headers, body, signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(t)
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
