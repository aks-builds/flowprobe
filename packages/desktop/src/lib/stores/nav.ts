import { writable } from 'svelte/store'

export type NavTab = 'collections' | 'environments' | 'history' | 'settings'

export const navStore = writable<NavTab>('collections')
