// Persisted UI layout preferences so the operator's workspace survives a
// reload — which rails are open, layer panel collapse, and density.

export type Density = 'cozy' | 'compact'

export interface UiPrefs {
  left: boolean
  right: boolean
  layers: boolean
  density: Density
}

const KEY = 'vantage.ui.v1'
const DEFAULTS: UiPrefs = {
  left: true,
  right: true,
  layers: true,
  density: 'cozy',
}

export function loadUi(): UiPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveUi(patch: Partial<UiPrefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadUi(), ...patch }))
  } catch {
    /* private mode / quota — prefs are best-effort */
  }
}

// Which layers the operator had switched on, remembered across reloads.
const LAYERS_KEY = 'vantage.layers.v1'

export function loadActiveLayers(): string[] | null {
  try {
    const raw = localStorage.getItem(LAYERS_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as string[]) : null
  } catch {
    return null
  }
}

export function saveActiveLayers(ids: string[]): void {
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(ids))
  } catch {
    /* best-effort */
  }
}

// One-time onboarding hint that surfaces the globe-click AI sitrep.
const HINT_KEY = 'vantage.hint.v1'

export function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return true // if storage is unavailable, don't nag
  }
}

export function markHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    /* best-effort */
  }
}
