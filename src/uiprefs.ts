// Persisted UI layout preferences so the operator's workspace survives a
// reload — which rails are open, layer panel collapse, and density.

import { loadJson, saveJson } from './storage'

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
  return { ...DEFAULTS, ...loadJson<Partial<UiPrefs>>(KEY, {}) }
}

export function saveUi(patch: Partial<UiPrefs>): void {
  saveJson(KEY, { ...loadUi(), ...patch })
}

// Which layers the operator had switched on, remembered across reloads.
const LAYERS_KEY = 'vantage.layers.v1'

export function loadActiveLayers(): string[] | null {
  const arr = loadJson<string[] | null>(LAYERS_KEY, null)
  return Array.isArray(arr) ? arr : null
}

export function saveActiveLayers(ids: string[]): void {
  saveJson(LAYERS_KEY, ids)
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
