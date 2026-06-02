// Output-sanitization helpers. Feed data (GDELT headlines, AIS ship names, ADS-B
// callsigns) and LLM output are UNTRUSTED — they must be escaped before they go
// into any innerHTML string (react-globe.gl tooltips) and any href.

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape a value for safe interpolation into an HTML string. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c])
}

/**
 * Allow only safe link schemes (http/https/mailto + relative). Anything else —
 * notably `javascript:` and `data:` — is dropped (returns undefined) so callers
 * can omit the href entirely.
 */
export function safeUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url) return undefined
  const trimmed = url.trim()
  // Probe the scheme with all whitespace (incl. tab/newline) stripped, so an
  // obfuscated "java\tscript:" can't slip past. The returned href is the
  // original trimmed string.
  const probe = trimmed.replace(/\s+/g, '').toLowerCase()
  if (/^(https?:|mailto:)/.test(probe)) return trimmed
  if (/^(\/\/|\/|\.\/|#)/.test(probe)) return trimmed
  return undefined
}
