import { describe, it, expect } from 'vitest'
import {
  nearestCameras,
  camsMatchingText,
  mightHaveCams,
} from './vision'
import type { Camera } from './layers'

function cam(
  id: string,
  lat: number,
  lng: number,
  region = '',
  name = id,
  road = '',
): Camera {
  return {
    kind: 'camera',
    id,
    lat,
    lng,
    name,
    road,
    region,
    image: '',
    source: '',
    live: true,
  }
}

// A few real-ish coordinates around the world.
const NYC = cam('nyc', 40.7128, -74.006)
const NEWARK = cam('ewr', 40.6895, -74.1745) // ~16 km from NYC
const PHILLY = cam('phl', 39.9526, -75.1652) // ~130 km from NYC
const LONDON = cam('lon', 51.5074, -0.1278) // ~5570 km from NYC
const TOKYO = cam('tyo', 35.6762, 139.6503) // far

describe('nearestCameras', () => {
  it('orders cameras by distance, closest first', () => {
    const out = nearestCameras([PHILLY, LONDON, NEWARK, NYC], 40.7128, -74.006)
    expect(out.map((c) => c.id)).toEqual(['nyc', 'ewr', 'phl'])
  })

  it('respects the maxKm radius (London/Tokyo excluded near NYC)', () => {
    const out = nearestCameras(
      [NYC, NEWARK, PHILLY, LONDON, TOKYO],
      40.7128,
      -74.006,
      10,
      400,
    )
    expect(out.map((c) => c.id).sort()).toEqual(['ewr', 'nyc', 'phl'])
  })

  it('caps the result count to n', () => {
    const out = nearestCameras([NYC, NEWARK, PHILLY], 40.7128, -74.006, 2)
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.id)).toEqual(['nyc', 'ewr'])
  })

  it('returns empty when nothing is within range', () => {
    expect(nearestCameras([LONDON, TOKYO], 40.7128, -74.006, 4, 400)).toEqual(
      [],
    )
  })

  it('handles an empty camera list', () => {
    expect(nearestCameras([], 0, 0)).toEqual([])
  })
})

describe('camsMatchingText', () => {
  const cams = [
    cam('a', 40.7, -74, 'New York · Manhattan', '5th Ave & 42nd St'),
    cam('b', 51.5, -0.1, 'London', 'A40 Westway'),
    cam('c', 34.0, -118, 'California · Los Angeles', 'I-405 / Sepulveda'),
  ]

  it('matches cameras by region/name words in the question', () => {
    expect(
      camsMatchingText("what's traffic like in Manhattan?", cams).map(
        (c) => c.id,
      ),
    ).toEqual(['a'])
    expect(
      camsMatchingText('is London moving right now', cams).map((c) => c.id),
    ).toEqual(['b'])
    expect(
      camsMatchingText('show me Los Angeles freeways', cams).map((c) => c.id),
    ).toEqual(['c'])
  })

  it('returns nothing when no area words match', () => {
    expect(camsMatchingText('assess the global situation', cams)).toEqual([])
  })

  it('matches whole words only (no substring false positives)', () => {
    const c2 = [cam('w', 40, -74, 'West Side Highway', 'West gantry')]
    // "midwest" / "westchester" contain "west" but must NOT match
    expect(camsMatchingText('any news from the midwest corridor', c2)).toEqual(
      [],
    )
    expect(camsMatchingText('traffic on the west side', c2).map((c) => c.id)).toEqual(
      ['w'],
    )
  })
})

describe('mightHaveCams', () => {
  it('flags questions about covered areas', () => {
    expect(mightHaveCams('how is traffic in New York')).toBe(true)
    expect(mightHaveCams('London bridge status')).toBe(true)
    expect(mightHaveCams('any California freeway closures')).toBe(true)
  })
  it('is false for unrelated questions', () => {
    expect(mightHaveCams('what is the oil price outlook')).toBe(false)
  })
})
