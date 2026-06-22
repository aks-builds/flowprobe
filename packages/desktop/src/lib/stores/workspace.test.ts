import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { workspaceStore } from './workspace.js'

describe('workspaceStore', () => {
  beforeEach(() => { workspaceStore.reset() })

  it('starts empty', () => {
    expect(get(workspaceStore).tabs).toHaveLength(0)
    expect(get(workspaceStore).activeId).toBeNull()
  })

  it('opens a tab and sets it active', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-1')
    const s = get(workspaceStore)
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].flowId).toBe('flow-1')
    expect(s.activeId).toBe(s.tabs[0].id)
  })

  it('opening same flow again focuses existing tab', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-1')  // pre-populate
    workspaceStore.openFlow('E2E Sample', 'flow-1')  // try duplicate
    expect(get(workspaceStore).tabs).toHaveLength(1)
  })

  it('closes a tab', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-1')
    const tabId = get(workspaceStore).tabs[0].id
    workspaceStore.closeTab(tabId)
    expect(get(workspaceStore).tabs).toHaveLength(0)
    expect(get(workspaceStore).activeId).toBeNull()
  })

  it('marks tab dirty', () => {
    workspaceStore.openFlow('E2E Sample', 'flow-2')
    const tabId = get(workspaceStore).tabs[0].id
    workspaceStore.markDirty(tabId)
    expect(get(workspaceStore).tabs[0].dirty).toBe(true)
    workspaceStore.markClean(tabId)
    expect(get(workspaceStore).tabs[0].dirty).toBe(false)
  })
})
