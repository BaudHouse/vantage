// Weather radar via RainViewer — free, no key. We fetch the frame index and
// expose the latest radar frame's tile-URL template; GlobeView paints those
// tiles onto the globe as a precipitation overlay.

const DEV = import.meta.env.DEV
const RV = DEV ? '/feeds/rainviewer' : 'https://api.rainviewer.com'

export interface RadarFrame {
  /** tile URL template with {z}/{x}/{y} placeholders */
  template: string
  time: number
}

export async function fetchRadarFrame(): Promise<RadarFrame | null> {
  try {
    const r = await fetch(`${RV}/public/weather-maps.json`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const past: { time: number; path: string }[] = j?.radar?.past ?? []
    const last = past[past.length - 1]
    if (!last) return null
    // Tiles must load cross-origin as textures, so always point at the real CDN
    // host (not the dev proxy). color 4 = "Universal Blue", smooth + no-snow.
    const host = 'https://tilecache.rainviewer.com'
    return {
      template: `${host}${last.path}/256/{z}/{x}/{y}/4/1_0.png`,
      time: last.time,
    }
  } catch {
    return null
  }
}
