import { describe, it, expect } from 'vitest'
import { cosine, anySimilar } from './embed'

describe('cosine', () => {
  it('is 1 for identical vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })
  it('is 1 for parallel (scaled) vectors', () => {
    expect(cosine([1, 0], [5, 0])).toBeCloseTo(1)
  })
  it('is 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('is -1 for opposite vectors', () => {
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1)
  })
  it('returns 0 for mismatched or empty vectors', () => {
    expect(cosine([1, 2], [1, 2, 3])).toBe(0)
    expect(cosine([], [])).toBe(0)
  })
  it('returns 0 when a vector is all-zero', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('anySimilar', () => {
  const pool = [
    [1, 0, 0],
    [0, 1, 0],
  ]
  it('finds a near-match above the threshold', () => {
    expect(anySimilar([0.99, 0.01, 0], pool, 0.8)).toBe(true)
  })
  it('rejects when nothing clears the threshold', () => {
    expect(anySimilar([0, 0, 1], pool, 0.8)).toBe(false)
  })
})
