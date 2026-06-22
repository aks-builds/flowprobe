<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fadeScale } from '../design/animations.js'
  import type { Collection } from '@flowprobe/core'

  export let open = false
  export let collections: Collection[] = []

  const dispatch = createEventDispatcher<{ select: { type: string; id: string; name: string; collectionName?: string }; close: void }>()

  const SHORTCUTS: Record<string, string> = {
    'run-collection': 'Ctrl+R',
    'new-flow': 'Ctrl+N',
    'validate': 'Ctrl+Shift+V',
    'open-file': 'Ctrl+O',
    'command-palette': 'Ctrl+K',
  }

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const paletteShortcut = isMac ? '⌘K' : 'Ctrl+K'

  let query = ''
  let highlighted = 0
  let inputEl: HTMLInputElement

  type ResultItem = { type: string; id: string; name: string; collectionName?: string; shortcut?: string; section: string }

  let allItems: ResultItem[]
  $: allItems = [
    ...collections.flatMap(c =>
      c.flows.map(f => ({ type: 'flow', id: f.id, name: f.name, collectionName: c.name, section: 'Flows' }))
    ),
    { type: 'action', id: 'run-collection', name: 'Run Collection', shortcut: SHORTCUTS['run-collection'], section: 'Actions' },
    { type: 'action', id: 'new-flow', name: 'New Flow', shortcut: SHORTCUTS['new-flow'], section: 'Actions' },
    { type: 'action', id: 'validate', name: 'Validate Collection', shortcut: SHORTCUTS['validate'], section: 'Actions' },
    { type: 'action', id: 'open-file', name: 'Open Collection File', shortcut: SHORTCUTS['open-file'], section: 'Actions' },
  ]

  $: filtered = query.trim()
    ? allItems.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.id.toLowerCase().includes(query.toLowerCase()) ||
        (i.collectionName ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  $: grouped = filtered.reduce((acc, item) => {
    (acc[item.section] ??= []).push(item)
    return acc
  }, {} as Record<string, ResultItem[]>)

  $: { query; highlighted = 0 }

  onMount(() => { if (open) inputEl?.focus() })
  $: if (open) setTimeout(() => inputEl?.focus(), 30)

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, filtered.length - 1) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0) }
    if (e.key === 'Enter' && filtered[highlighted]) {
      dispatch('select', filtered[highlighted])
      dispatch('close')
    }
    if (e.key === 'Escape') dispatch('close')
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="overlay" on:click={() => dispatch('close')} role="presentation" in:fadeScale={{ duration: 150 }}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-interactive-supports-focus -->
    <div class="palette" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Command palette">
      <input
        bind:this={inputEl}
        bind:value={query}
        class="search"
        placeholder="Search flows, run, open…"
        on:keydown={handleKey}
        aria-label="Search"
        autocomplete="off"
      />
      <div class="results">
        {#if filtered.length === 0}
          {#if collections.length === 0}
            <div class="empty">
              <div class="empty-title">No collections open</div>
              <div class="empty-hint">Drag a .flowprobe.json file here or press <kbd>Ctrl+O</kbd> to open one</div>
            </div>
          {:else}
            <div class="empty">
              <div class="empty-title">No results for "{query}"</div>
              <div class="empty-hint">Try searching for a step type like "kafka" or "webhook"</div>
            </div>
          {/if}
        {:else}
          {#each Object.entries(grouped) as [section, items]}
            <div class="section-header">{section}</div>
            {#each items as item}
              {@const idx = filtered.indexOf(item)}
              <button
                class="result-item"
                class:active={idx === highlighted}
                on:click={() => { dispatch('select', item); dispatch('close') }}
                on:mouseenter={() => highlighted = idx}
                role="option"
                aria-selected={idx === highlighted}
              >
                <span class="result-icon">{item.type === 'flow' ? '⚡' : item.type === 'broker' ? '🔌' : '⌘'}</span>
                <span class="result-name">{item.name}</span>
                {#if item.collectionName}
                  <span class="result-meta">{item.collectionName}</span>
                {/if}
                {#if item.shortcut}
                  <kbd class="shortcut">{item.shortcut}</kbd>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>
      <div class="palette-footer">
        <span class="footer-hint">↑↓ navigate · ↵ select · Esc close · {paletteShortcut} toggle</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(15,23,42,.4); z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding-top: 80px; }
  .palette { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); width: 500px; box-shadow: var(--shadow-lg); overflow: hidden; }
  .search { width: 100%; padding: 14px 16px; border: none; border-bottom: 1px solid var(--border); font-size: var(--text-md); outline: none; background: var(--surface); color: var(--text-primary); box-sizing: border-box; }
  .search::placeholder { color: var(--text-muted); }
  .results { max-height: 360px; overflow-y: auto; }
  .section-header { font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); letter-spacing: .08em; text-transform: uppercase; padding: 8px 16px 4px; }
  .result-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 16px; border: none; background: none; cursor: pointer; text-align: left; transition: background var(--dur-fast); font-family: var(--font-sans); }
  .result-item.active { background: var(--bg); }
  .result-item:hover { background: var(--bg); }
  .result-icon { font-size: 14px; flex-shrink: 0; width: 18px; }
  .result-name { font-size: var(--text-md); color: var(--text-primary); font-weight: 500; flex: 1; }
  .result-meta { font-size: var(--text-xs); color: var(--text-muted); }
  kbd.shortcut { font-size: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; }
  .empty { padding: 24px 16px; text-align: center; }
  .empty-title { font-size: var(--text-md); color: var(--text-primary); font-weight: 500; margin-bottom: 5px; }
  .empty-hint { font-size: var(--text-sm); color: var(--text-muted); }
  .empty-hint kbd { background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-size: 11px; font-family: var(--font-mono); }
  .palette-footer { border-top: 1px solid var(--border); padding: 7px 16px; background: var(--bg); }
  .footer-hint { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }

  @media (prefers-reduced-motion: reduce) {
    .result-item { transition: none; }
  }
</style>
