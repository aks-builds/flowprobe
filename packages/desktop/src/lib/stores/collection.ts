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

// --- Run state ---
export type RunState = 'idle' | 'running' | 'done' | 'error' | 'aborted'
export type ValidationError = { stepId: string; field: string; message: string }
export type BrokerStatus = {
  connected: boolean; connecting: boolean; latencyMs: number | null; error: string | null
}

import type { Flow } from '@flowprobe/core'

function createRunStore() {
  const { subscribe, update, set } = writable<{
    state: RunState; results: import('@flowprobe/core').StepRunResult[]; errors: ValidationError[]
  }>({ state: 'idle', results: [], errors: [] })
  return {
    subscribe,
    startRun: () => update(s => ({ ...s, state: 'running', results: [], errors: [] })),
    finishRun: () => update(s => ({ ...s, state: 'done' })),
    abortRun: () => update(s => ({ ...s, state: 'aborted' })),
    setError: (msg: string) => update(s => ({ ...s, state: 'error', errors: [{ stepId: '', field: '', message: msg }] })),
    addResult: (r: import('@flowprobe/core').StepRunResult) => update(s => ({ ...s, results: [...s.results, r] })),
    reset: () => set({ state: 'idle', results: [], errors: [] }),
  }
}
export const runStore = createRunStore()

function createBrokerStatusStore() {
  const { subscribe, update } = writable<Map<string, BrokerStatus>>(new Map())
  return {
    subscribe,
    set: (id: string, status: BrokerStatus) =>
      update(m => { const n = new Map(m); n.set(id, status); return n }),
    remove: (id: string) => update(m => { const n = new Map(m); n.delete(id); return n }),
  }
}
export const brokerStatusStore = createBrokerStatusStore()

export function validateFlow(flow: Flow): ValidationError[] {
  const errors: ValidationError[] = []
  for (const step of flow.steps) {
    if (step.type === 'producer') {
      if (!step.broker) errors.push({ stepId: step.id, field: 'broker', message: 'Required — select a connected broker' })
      if (!step.topic) errors.push({ stepId: step.id, field: 'topic', message: 'Required — enter a topic name' })
    }
    if (step.type === 'wait') {
      if (!step.consumer.broker) errors.push({ stepId: step.id, field: 'broker', message: 'Required' })
      if (!step.consumer.topic) errors.push({ stepId: step.id, field: 'topic', message: 'Required' })
      if (step.timeoutMs <= 0) errors.push({ stepId: step.id, field: 'timeoutMs', message: 'Must be > 0' })
    }
    if (step.type === 'http-assert') {
      if (!step.url || (!step.url.startsWith('http://') && !step.url.startsWith('https://')))
        errors.push({ stepId: step.id, field: 'url', message: 'Must start with http:// or https://' })
    }
  }
  return errors
}
