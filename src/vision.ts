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

// Hint that a question might reference an area our keyless cams cover (NYC /
// London / California), so the Operator knows to load + check cameras.
const CAM_AREA_HINTS =
  /\b(new york|nyc|manhattan|brooklyn|queens|bronx|harlem|times square|london|england|california|los angeles|san francisco|sacramento|san diego|oakland|caltrans|freeway|interstate|traffic|road|street|highway|webcam|camera)\b/i

export function mightHaveCams(text: string): boolean {
  return CAM_AREA_HINTS.test(text)
}

// Whole-word containment (so "west" doesn't match inside "midwest").
function wordIn(haystack: string, needle: string): boolean {
  let from = 0
  for (;;) {
    const i = haystack.indexOf(needle, from)
    if (i < 0) return false
    const before = i === 0 ? ' ' : haystack[i - 1]
    const after = haystack[i + needle.length] ?? ' '
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return true
    from = i + 1
  }
}

/**
 * Cameras whose region/name/road words appear in the question text — covers
 * the cities our cameras actually live in (which a conflict gazetteer won't
 * have). Scored by number of matching tokens, best first.
 */
export function camsMatchingText(
  text: string,
  cams: Camera[],
  n = 3,
): Camera[] {
  const q = ` ${text.toLowerCase()} `
  const scored = cams
    .map((c) => {
      const toks = new Set(
        `${c.region} ${c.name} ${c.road}`
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length >= 4),
      )
      let score = 0
      for (const tok of toks) if (wordIn(q, tok)) score++
      return { c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, n).map((x) => x.c)
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
