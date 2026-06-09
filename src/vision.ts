// Shared camera-vision helpers used by both the gallery "scan view" and the
// globe-click area scan.

import type { Camera } from './layers'
import { fetchImageBase64 } from './net'
import { analyzeArea, visionModel } from './operator'

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Cameras nearest a point, closest first (optionally within maxKm). */
export function nearestCameras(
  cams: Camera[],
  lat: number,
  lng: number,
  n = 4,
  maxKm = 400,
): Camera[] {
  return cams
    .map((c) => ({ c, d: haversine(lat, lng, c.lat, c.lng) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c)
}

export interface ScanOutcome {
  result?: string
  err?: string
}

/** Capture frames from up to 4 cameras and produce a combined vision sitrep. */
export async function scanCameras(
  cams: Camera[],
  label: string,
  onProgress: (s: string) => void,
): Promise<ScanOutcome> {
  const pick = cams.slice(0, 4)
  if (!pick.length) return { err: 'No cameras in this area.' }
  onProgress('finding vision model…')
  const model = await visionModel()
  if (!model) return { err: 'No vision model. Run `ollama pull qwen2.5vl:7b`.' }
  onProgress(`capturing ${pick.length} frames…`)
  const grabbed = await Promise.all(
    pick.map(async (c) => ({ cam: c, b64: await fetchImageBase64(c.image) })),
  )
  const ok = grabbed.filter((g) => g.b64) as { cam: Camera; b64: string }[]
  if (!ok.length) return { err: 'Could not capture any frames.' }
  onProgress(`analyzing ${ok.length} cameras…`)
  const list = ok
    .map((g, i) => `${i + 1}. ${g.cam.name} (${g.cam.region})`)
    .join('\n')
  const out = await analyzeArea(
    model,
    ok.map((g) => g.b64),
    `Live cameras${label ? ` near ${label}` : ''} (in image order):\n${list}\n\nProduce a combined situational report.`,
  )
  return { result: out ?? '⚠ Vision model unreachable.' }
}
