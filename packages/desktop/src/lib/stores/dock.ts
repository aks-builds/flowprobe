import { writable } from 'svelte/store'
import type { StepRunResult } from '@flowprobe/core'

export type DockTab = 'results' | 'assertions' | 'diff' | 'payload' | 'history'

export const dockTabStore = writable<DockTab>('results')

export type RunSnapshot = {
  results: StepRunResult[]
  state: string
  timestamp: number
}

function createDiffStore() {
  const { subscribe, update } = writable<{ current: RunSnapshot | null; previous: RunSnapshot | null }>({
    current: null, previous: null,
  })
  return {
    subscribe,
    recordRun(snapshot: RunSnapshot) {
      update(s => ({ previous: s.current, current: snapshot }))
    },
  }
}

export const diffStore = createDiffStore()
