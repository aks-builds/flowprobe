import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}))

describe('environmentStore', () => {
  it('starts with empty environments', async () => {
    const { environmentStore } = await import('./environments.js')
    expect(get(environmentStore).environments).toHaveLength(0)
  })

  it('adds environment', async () => {
    const { environmentStore } = await import('./environments.js')
    environmentStore.addEnv('staging')
    expect(get(environmentStore).environments.some(e => e.name === 'staging')).toBe(true)
  })

  it('sets active environment', async () => {
    const { environmentStore, activeEnvironment } = await import('./environments.js')
    environmentStore.setActive('staging')
    expect(get(activeEnvironment)?.name).toBe('staging')
  })

  it('adds a variable with secret masking', async () => {
    const { environmentStore, resolveVar } = await import('./environments.js')
    environmentStore.setVar('staging', 'API_KEY', 'sk-secret', true)
    expect(resolveVar('API_KEY')).toBe('sk-secret')
  })
})
