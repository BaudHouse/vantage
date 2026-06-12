// Shared test utilities (imported only from *.test.ts files).

/**
 * Install a fresh in-memory localStorage on globalThis so storage-backed
 * modules can run under the default node test environment (no jsdom).
 */
export function installStorage(): void {
  const map = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}
