// Extract the FIRST balanced JSON value from a messy model response. Replaces
// greedy `\[[\s\S]*\]` / `\{[\s\S]*\}` regexes that span from the first opener
// to the LAST closer — which silently corrupt the parse when a model emits two
// objects/arrays or trailing prose. This scanner respects strings + escapes and
// returns exactly the first complete bracketed span.

export function firstBalanced(
  text: string,
  open: '[' | '{',
  close: ']' | '}',
): string | null {
  const start = text.indexOf(open)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
