import { writable, derived, get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

export type EnvVar = { key: string; value: string; secret: boolean }
export type Environment = { name: string; vars: EnvVar[] }

type EnvState = { environments: Environment[]; activeId: string | null }

const FILENAME = 'environments.json'

function createEnvironmentStore() {
  const { subscribe, update, set } = writable<EnvState>({ environments: [], activeId: null })

  return {
    subscribe,
    async load() {
      try {
        const raw = await invoke<string | null>('read_app_config', { filename: FILENAME })
        if (raw) set(JSON.parse(raw))
      } catch { /* first run, no file */ }
    },
    async save() {
      try {
        await invoke('write_app_config', { filename: FILENAME, content: JSON.stringify(get({ subscribe })) })
      } catch (e) { console.error('Failed to save environments:', e) }
    },
    addEnv(name: string) {
      update(s => {
        if (s.environments.some(e => e.name === name)) return s
        return { ...s, environments: [...s.environments, { name, vars: [] }] }
      })
      this.save()
    },
    removeEnv(name: string) {
      update(s => ({
        ...s,
        environments: s.environments.filter(e => e.name !== name),
        activeId: s.activeId === name ? null : s.activeId,
      }))
      this.save()
    },
    setActive(name: string) {
      update(s => ({ ...s, activeId: name }))
      this.save()
    },
    setVar(envName: string, key: string, value: string, secret = false) {
      update(s => ({
        ...s,
        environments: s.environments.map(e =>
          e.name !== envName ? e : {
            ...e,
            vars: e.vars.some(v => v.key === key)
              ? e.vars.map(v => v.key === key ? { key, value, secret } : v)
              : [...e.vars, { key, value, secret }]
          }
        ),
      }))
      this.save()
    },
    removeVar(envName: string, key: string) {
      update(s => ({
        ...s,
        environments: s.environments.map(e =>
          e.name !== envName ? e : { ...e, vars: e.vars.filter(v => v.key !== key) }
        ),
      }))
      this.save()
    },
  }
}

export const environmentStore = createEnvironmentStore()
export const activeEnvironment = derived(
  environmentStore,
  s => s.environments.find(e => e.name === s.activeId) ?? null
)
export function resolveVar(key: string): string | undefined {
  const active = get(activeEnvironment)
  return active?.vars.find(v => v.key === key)?.value
}
