import { describe, it, expect } from 'vitest'
import { resolvePlace } from './gazetteer'

// Stub country-centroid lookup so the test is independent of feeds.ts.
const centroid = (c: string): [number, number] | null =>
  ({ 'United States': [37.1, -95.7] as [number, number] })[c] ?? null

describe('resolvePlace — the headline-geocoding moat', () => {
  it('plots a US-published Kyiv story in Ukraine, not the US', () => {
    const r = resolvePlace(
      'Russia launches massive drone strike on Kyiv — CNN',
      'United States',
      centroid,
    )
    expect(r?.place).toBe('Kyiv')
    expect(r?.country).toBe('Ukraine')
    expect(r?.precise).toBe(true)
    // near Kyiv (50.45, 30.52), within jitter range
    expect(Math.abs((r?.lat ?? 0) - 50.45)).toBeLessThan(2)
  })

  it('prefers the most specific place when several appear', () => {
    const r = resolvePlace('Israel expands Rafah operation as Gaza toll rises', 'UK', centroid)
    expect(['Rafah', 'Gaza']).toContain(r?.place)
    expect(r?.country).toBe('Palestine')
    expect(r?.precise).toBe(true)
  })

  it('maps thematic terms (Houthis) to their place', () => {
    const r = resolvePlace('Houthis claim Red Sea attack on tanker', 'United States', centroid)
    expect(r?.country).toBe('Yemen')
    expect(r?.precise).toBe(true)
  })

  it('falls back to publisher country (imprecise) when no place is named', () => {
    const r = resolvePlace('Quiet county council budget meeting', 'United States', centroid)
    expect(r?.precise).toBe(false)
    expect(r?.lat).toBeCloseTo(37.1, 1)
  })

  it('does not word-match inside other words', () => {
    // "gaza" must not match inside e.g. "magazine"
    const r = resolvePlace('New magazine launches in Ohio', 'United States', centroid)
    expect(r?.precise).toBe(false)
  })

  it('finds a standalone alias even when it first appears embedded in a word', () => {
    // "india" (and "indian") appear inside "indiana" first, then "India" stands
    // alone — the scanner must keep looking past the embedded first hit.
    const r = resolvePlace(
      'Indiana plant fire; separately India reports a border clash',
      'United States',
      centroid,
    )
    expect(r?.country).toBe('India')
    expect(r?.precise).toBe(true)
  })

  it('resolves a country named in the headline (precise, not publisher)', () => {
    const r = resolvePlace('France pledges more aid amid protests', 'United States', centroid)
    expect(r?.country).toBe('France')
    expect(r?.precise).toBe(true)
  })

  it('prefers a specific city over the country also named', () => {
    const r = resolvePlace('Drone strike on Kyiv, Ukraine says', 'United States', centroid)
    expect(r?.place).toBe('Kyiv') // city beats the country mention
  })
})
