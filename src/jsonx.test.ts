import { describe, it, expect } from 'vitest'
import { firstBalanced } from './jsonx'

describe('firstBalanced', () => {
  it('extracts a single array/object', () => {
    expect(firstBalanced('[1,2,3]', '[', ']')).toBe('[1,2,3]')
    expect(firstBalanced('{"a":1}', '{', '}')).toBe('{"a":1}')
  })

  it('extracts only the FIRST of two adjacent values (the greedy-regex bug)', () => {
    expect(firstBalanced('[{"a":1}]\n[{"b":2}]', '[', ']')).toBe('[{"a":1}]')
    expect(firstBalanced('{"a":1}\n{"b":2}', '{', '}')).toBe('{"a":1}')
  })

  it('recovers a value embedded in prose', () => {
    expect(firstBalanced('Here you go: [{"x":1}] thanks', '[', ']')).toBe(
      '[{"x":1}]',
    )
  })

  it('respects nested brackets', () => {
    expect(firstBalanced('{"a":[1,{"b":2}],"c":3} junk', '{', '}')).toBe(
      '{"a":[1,{"b":2}],"c":3}',
    )
  })

  it('ignores brackets inside strings and escapes', () => {
    expect(firstBalanced('{"q":"a ] } string \\" still"}', '{', '}')).toBe(
      '{"q":"a ] } string \\" still"}',
    )
  })

  it('returns null when no opener or unbalanced', () => {
    expect(firstBalanced('no brackets', '[', ']')).toBeNull()
    expect(firstBalanced('{"a":1', '{', '}')).toBeNull()
  })
})
