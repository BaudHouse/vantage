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
