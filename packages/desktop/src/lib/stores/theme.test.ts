import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

// Mock localStorage
const store: Record<string, string> = {}

describe('themeStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    delete store['flowprobe:theme']
    // Re-apply stubs after resetModules
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
    })
    vi.stubGlobal('document', { documentElement: { setAttribute: vi.fn() } })
  })

  it('defaults to dark', async () => {
    const { themeStore } = await import('./theme.js')
    expect(get(themeStore)).toBe('dark')
  })

  it('persists to localStorage on set', async () => {
    const { themeStore } = await import('./theme.js')
    themeStore.set('light')
    expect(store['flowprobe:theme']).toBe('light')
  })
})
