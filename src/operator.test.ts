import { describe, it, expect } from 'vitest'
import { parseProposed } from './operator'

describe('parseProposed', () => {
  it('parses a clean JSON array of proposals', () => {
    const out = parseProposed(
      '[{"category":"MIL","question":"Will the Kyiv grid strikes continue past March?","seedYes":40}]',
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      category: 'MIL',
      question: 'Will the Kyiv grid strikes continue past March?',
      seedYes: 40,
    })
  })

  it('digs an array out of an object wrapper (Ollama JSON mode)', () => {
    const out = parseProposed(
      '{"markets":[{"category":"econ","question":"Will Brent crude top $110 in Q2?","seedYes":30}]}',
    )
    expect(out).toHaveLength(1)
    expect(out[0].category).toBe('ECON') // upper-cased
  })

  it('recovers an array embedded in prose', () => {
    const out = parseProposed(
      'Here you go:\n[{"category":"GEO","question":"Will sanctions on the region tighten?","seedYes":55}]\nThanks',
    )
    expect(out).toHaveLength(1)
    expect(out[0].category).toBe('GEO')
  })

  it('drops items with invalid category or too-short questions', () => {
    const out = parseProposed(
      '[{"category":"XYZ","question":"valid length question here","seedYes":20},{"category":"MIL","question":"short","seedYes":10}]',
    )
    expect(out).toEqual([])
  })

  it('clamps seedYes and defaults when missing/non-numeric', () => {
    const out = parseProposed(
      '[{"category":"CIVIL","question":"Will the truce hold through summer?"},{"category":"MIL","question":"Will the offensive stall before autumn?","seedYes":250}]',
    )
    expect(out[0].seedYes).toBe(25) // default
    expect(out[1].seedYes).toBe(99) // clamped
  })

  it('returns [] for unparseable text', () => {
    expect(parseProposed('not json at all')).toEqual([])
  })

  it('caps the result at 5 proposals', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      category: 'MIL',
      question: `Will scenario number ${i} come to pass this year?`,
      seedYes: 20,
    }))
    expect(parseProposed(JSON.stringify(many))).toHaveLength(5)
  })
})
