import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { navStore, type NavTab } from './nav.js'

describe('navStore', () => {
  it('defaults to collections', () => {
    expect(get(navStore)).toBe('collections')
  })
  it('switches tabs', () => {
    navStore.set('environments')
    expect(get(navStore)).toBe('environments')
    navStore.set('collections')
  })
})
