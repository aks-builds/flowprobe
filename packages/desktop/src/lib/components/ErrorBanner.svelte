<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  export let message: string
  export let level: 'error' | 'warning' | 'info' = 'error'
  export let autoDismissMs: number = 0 // 0 = no auto-dismiss

  const dispatch = createEventDispatcher<{ dismiss: void }>()
  let timer: ReturnType<typeof setTimeout> | null = null

  onMount(() => {
    if (autoDismissMs > 0) {
      timer = setTimeout(() => dispatch('dismiss'), autoDismissMs)
    }
  })
  onDestroy(() => { if (timer) clearTimeout(timer) })

  const colors = {
    error:   { bg: 'var(--error-light)',    border: '#fecaca', text: 'var(--error)',    icon: '✕' },
    warning: { bg: 'var(--warning-light)',  border: '#fde68a', text: 'var(--warning)',  icon: '⚠' },
    info:    { bg: 'var(--accent-light)',   border: '#c4b5fd', text: 'var(--accent)',   icon: 'ℹ' },
  }
  $: c = colors[level]
</script>

<div
  class="banner"
  role="alert"
  aria-live="assertive"
  style="background:{c.bg};border-color:{c.border};color:{c.text}"
  in:fadeScale={{ duration: 150 }}
>
  <span class="icon">{c.icon}</span>
  <span class="msg">{message}</span>
  <button class="close" on:click={() => dispatch('dismiss')} aria-label="Dismiss">✕</button>
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid;
    font-size: var(--text-sm);
    font-weight: 500;
    flex-shrink: 0;
  }
  .icon { font-size: 12px; flex-shrink: 0; }
  .msg { flex: 1; }
  .close {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    opacity: .6;
    padding: 0 2px;
    color: inherit;
  }
  .close:hover { opacity: 1; }
</style>
