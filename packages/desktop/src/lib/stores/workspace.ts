import { writable, derived } from 'svelte/store'

export type WorkspaceTab = {
  id: string
  collectionName: string
  flowId: string
  dirty: boolean
}

type WorkspaceState = {
  tabs: WorkspaceTab[]
  activeId: string | null
}

function createWorkspaceStore() {
  const { subscribe, update, set } = writable<WorkspaceState>({ tabs: [], activeId: null })

  return {
    subscribe,
    openFlow(collectionName: string, flowId: string) {
      update(s => {
        const existing = s.tabs.find(t => t.collectionName === collectionName && t.flowId === flowId)
        if (existing) return { ...s, activeId: existing.id }
        const id = `tab-${collectionName}-${flowId}-${Date.now()}`
        const tab: WorkspaceTab = { id, collectionName, flowId, dirty: false }
        return { tabs: [...s.tabs, tab], activeId: id }
      })
    },
    closeTab(id: string) {
      update(s => {
        const remaining = s.tabs.filter(t => t.id !== id)
        const activeId = s.activeId === id
          ? (remaining.at(-1)?.id ?? null)
          : s.activeId
        return { tabs: remaining, activeId }
      })
    },
    setActive(id: string) {
      update(s => ({ ...s, activeId: id }))
    },
    markDirty(id: string) {
      update(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, dirty: true } : t) }))
    },
    markClean(id: string) {
      update(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? { ...t, dirty: false } : t) }))
    },
    reset() {
      set({ tabs: [], activeId: null })
    },
  }
}

export const workspaceStore = createWorkspaceStore()
export const activeTab = derived(workspaceStore, s => s.tabs.find(t => t.id === s.activeId) ?? null)
