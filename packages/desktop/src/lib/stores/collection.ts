// packages/desktop/src/lib/stores/collection.ts
import { writable } from 'svelte/store'
import type { Collection } from '@flowprobe/core'

type CollectionStore = {
  collections: Collection[]
  activeCollectionId: string | null
  activeFlowId: string | null
}

function createCollectionStore() {
  const { subscribe, update, set } = writable<CollectionStore>({
    collections: [],
    activeCollectionId: null,
    activeFlowId: null,
  })

  return {
    subscribe,

    /** Set the active collection, and optionally the active flow within it. */
    setActive(collectionId: string, flowId?: string) {
      update(s => ({
        ...s,
        activeCollectionId: collectionId,
        activeFlowId: flowId ?? s.activeFlowId,
      }))
    },

    /**
     * Upsert a collection into the store.
     * If a collection with the same name already exists it is replaced.
     */
    loadCollection(c: Collection) {
      update(s => ({
        ...s,
        collections: [...s.collections.filter(x => x.name !== c.name), c],
      }))
    },

    /** Reset the store to its initial empty state. */
    clear() {
      set({ collections: [], activeCollectionId: null, activeFlowId: null })
    },
  }
}

export const collectionStore = createCollectionStore()
