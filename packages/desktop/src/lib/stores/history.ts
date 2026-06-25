import { writable, get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

export type RunRecord = {
  runId: string
  flowId: string
  flowName: string
  collectionName: string
  environment: string | null
  startedAt: string
  durationMs: number
  passed: number
  failed: number
}

const FILENAME = 'history.json'
const MAX_RECORDS = 100

function createHistoryStore() {
  const { subscribe, update, set } = writable<RunRecord[]>([])

  return {
    subscribe,
    async load() {
      try {
        const raw = await invoke<string | null>('read_app_config', { filename: FILENAME })
        if (raw) set(JSON.parse(raw))
      } catch { /* first run */ }
    },
    async record(r: RunRecord) {
      update(records => {
        const next = [r, ...records].slice(0, MAX_RECORDS)
        invoke('write_app_config', { filename: FILENAME, content: JSON.stringify(next) }).catch(console.error)
        return next
      })
    },
    getAll() { return get({ subscribe }) },
  }
}

export const historyStore = createHistoryStore()
