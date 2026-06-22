import { writable } from 'svelte/store'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'flowprobe:theme'

function getInitial(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* SSR / unavailable */ }
  return 'dark'
}

function applyTheme(t: Theme) {
  try { document.documentElement.setAttribute('data-theme', t) } catch { /* SSR */ }
}

function createThemeStore() {
  const initial = getInitial()
  applyTheme(initial)
  const { subscribe, set } = writable<Theme>(initial)
  return {
    subscribe,
    set(t: Theme) {
      applyTheme(t)
      try { localStorage.setItem(STORAGE_KEY, t) } catch { /* unavailable */ }
      set(t)
    },
    toggle() {
      subscribe(current => this.set(current === 'dark' ? 'light' : 'dark'))()
    },
  }
}

export const themeStore = createThemeStore()
