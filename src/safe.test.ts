import { describe, it, expect } from 'vitest'
import { escapeHtml, safeUrl } from './safe'

describe('escapeHtml', () => {
  it('neutralizes an XSS payload in feed text', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
  })
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
  })
  it('handles null/undefined safely', () => {
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(null)).toBe('')
  })
})

describe('safeUrl', () => {
  it('allows http(s) and mailto', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(safeUrl('http://a.b')).toBe('http://a.b')
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
  })
  it('drops javascript: and data: (incl. obfuscated)', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('java\tscript:alert(1)')).toBeUndefined()
    expect(safeUrl(' JAVASCRIPT:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,<script>')).toBeUndefined()
  })
  it('allows relative and anchor links', () => {
    expect(safeUrl('/path')).toBe('/path')
    expect(safeUrl('#x')).toBe('#x')
  })
  it('rejects empty/non-strings', () => {
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
    expect(safeUrl(42 as unknown)).toBeUndefined()
  })
})
