// Cosine similarity for embedding vectors (used to measure semantic agreement
// across independent cascade drafts). Pure + dependency-free.

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

/** True if any vector in `pool` is at least `min` cosine-similar to `v`. */
export function anySimilar(v: number[], pool: number[][], min: number): boolean {
  for (const p of pool) if (cosine(v, p) >= min) return true
  return false
}
