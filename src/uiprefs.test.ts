import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadUi,
  saveUi,
  loadActiveLayers,
  saveActiveLayers,
} from './uiprefs'

import { installStorage } from './test-helpers'

describe('uiprefs', () => {
  beforeEach(installStorage)

  it('returns sane defaults on a fresh browser', () => {
    expect(loadUi()).toEqual({
      left: true,
      right: true,
      layers: true,
      density: 'cozy',
    })
  })

  it('merges a partial patch over existing prefs', () => {
    saveUi({ left: false })
    saveUi({ density: 'compact' })
    const ui = loadUi()
    expect(ui.left).toBe(false)
    expect(ui.density).toBe('compact')
    expect(ui.right).toBe(true) // untouched key keeps its default
  })

  it('tolerates corrupt JSON and falls back to defaults', () => {
    localStorage.setItem('vantage.ui.v1', '{not valid json')
    expect(loadUi().density).toBe('cozy')
  })

  it('round-trips the active-layer list', () => {
    expect(loadActiveLayers()).toBeNull()
    saveActiveLayers(['conflict', 'aircraft'])
    expect(loadActiveLayers()).toEqual(['conflict', 'aircraft'])
  })

  it('returns null for a non-array layers payload', () => {
    localStorage.setItem('vantage.layers.v1', '{"a":1}')
    expect(loadActiveLayers()).toBeNull()
  })
})
