// Tiny localStorage JSON helpers. Every persistence module (trends, watchlist,
// uiprefs, predictions) goes through these so corruption-tolerance and
// private-mode/quota behavior live in exactly one place.

/** Parse JSON from localStorage; on missing/corrupt/unavailable, the fallback. */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Persist a value as JSON; best-effort (quota / private mode swallowed). */
export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort */
  }
}

/** Remove a key; best-effort. */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}
