import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { dockTabStore, diffStore, type DockTab } from './dock.js'

describe('dockTabStore', () => {
  it('defaults to results', () => { expect(get(dockTabStore)).toBe('results') })
  it('switches tab', () => {
    dockTabStore.set('assertions')
    expect(get(dockTabStore)).toBe('assertions')
    dockTabStore.set('results')
  })
})

describe('diffStore', () => {
  it('starts empty', () => {
    const s = get(diffStore)
    expect(s.current).toBeNull()
    expect(s.previous).toBeNull()
  })
  it('records first run as current', () => {
    diffStore.recordRun({ results: [], state: 'done', timestamp: 1 })
    expect(get(diffStore).current?.timestamp).toBe(1)
    expect(get(diffStore).previous).toBeNull()
  })
  it('second run pushes first to previous', () => {
    diffStore.recordRun({ results: [], state: 'done', timestamp: 2 })
    expect(get(diffStore).current?.timestamp).toBe(2)
    expect(get(diffStore).previous?.timestamp).toBe(1)
  })
})
