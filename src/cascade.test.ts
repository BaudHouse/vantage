import { describe, it, expect } from 'vitest'
import { parseCascade, chainProbability } from './cascade'

describe('chainProbability', () => {
  it('compounds conditional likelihoods', () => {
    // 0.7 * 0.5 * 0.4 = 0.14 → 14%
    expect(
      chainProbability({
        steps: [
          { domain: 'MIL', effect: 'a', likelihood: 70, horizon: '24-72h' },
          { domain: 'ECON', effect: 'b', likelihood: 50, horizon: '1-2wk' },
          { domain: 'SUPPLY', effect: 'c', likelihood: 40, horizon: '1-3mo' },
        ],
      }),
    ).toBe(14)
  })

  it('is the single likelihood for a one-step chain', () => {
    expect(
      chainProbability({
        steps: [{ domain: 'MIL', effect: 'a', likelihood: 65, horizon: 'x' }],
      }),
    ).toBe(65)
  })

  it('is 0 for an empty chain', () => {
    expect(chainProbability({ steps: [] })).toBe(0)
  })
})

describe('parseCascade', () => {
  const good =
    '{"chains":[{"steps":[{"domain":"MIL","effect":"Strikes on Kyiv grid intensify","likelihood":70,"horizon":"24-72h"},{"domain":"ENERGY","effect":"EU gas prices spike","likelihood":55,"horizon":"1-2wk"}]}],"bottom_line":"Energy is the transmission channel."}'

  it('parses a clean cascade', () => {
    const c = parseCascade(good)
    expect(c.chains).toHaveLength(1)
    expect(c.chains[0].steps).toHaveLength(2)
    expect(c.chains[0].steps[0].domain).toBe('MIL')
    expect(c.bottomLine).toContain('transmission')
  })

  it('recovers a cascade embedded in prose', () => {
    const c = parseCascade('Here is the analysis:\n' + good + '\nDone.')
    expect(c.chains[0].steps).toHaveLength(2)
  })

  it('upper-cases and validates domain, defaulting unknowns to OTHER', () => {
    const c = parseCascade(
      '{"chains":[{"steps":[{"domain":"weather","effect":"flood disrupts port","likelihood":40,"horizon":"1wk"}]}]}',
    )
    expect(c.chains[0].steps[0].domain).toBe('OTHER')
  })

  it('clamps likelihood and defaults when missing', () => {
    const c = parseCascade(
      '{"chains":[{"steps":[{"domain":"ECON","effect":"markets wobble"},{"domain":"MIL","effect":"escalation","likelihood":250}]}]}',
    )
    expect(c.chains[0].steps[0].likelihood).toBe(50) // default
    expect(c.chains[0].steps[1].likelihood).toBe(100) // clamped
  })

  it('drops steps with no real effect text', () => {
    const c = parseCascade(
      '{"chains":[{"steps":[{"domain":"MIL","effect":"x","likelihood":50},{"domain":"ECON","effect":"a credible downstream effect","likelihood":50}]}]}',
    )
    expect(c.chains[0].steps).toHaveLength(1)
  })

  it('tolerates a bare array of steps as a chain', () => {
    const c = parseCascade(
      '{"chains":[[{"domain":"CYBER","effect":"grid intrusion attempts rise","likelihood":35,"horizon":"1-2wk"}]]}',
    )
    expect(c.chains[0].steps[0].domain).toBe('CYBER')
  })

  it('returns empty on unparseable text', () => {
    expect(parseCascade('not json')).toEqual({ chains: [], bottomLine: '' })
  })

  it('caps at 5 chains', () => {
    const chains = Array.from({ length: 8 }, () => ({
      steps: [{ domain: 'MIL', effect: 'a real effect here', likelihood: 50 }],
    }))
    expect(parseCascade(JSON.stringify({ chains })).chains).toHaveLength(5)
  })
})
