import { describe, it, expect } from 'vitest'
import { nearestCameras } from './vision'
import type { Camera } from './layers'

function cam(id: string, lat: number, lng: number): Camera {
  return {
    kind: 'camera',
    id,
    lat,
    lng,
    name: id,
    road: '',
    region: '',
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
