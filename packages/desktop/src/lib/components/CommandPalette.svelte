<!-- packages/desktop/src/lib/components/CommandPalette.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fadeScale } from '../design/animations.js'
  import type { Collection } from '@flowprobe/core'

  export let open = false
  export let collections: Collection[] = []

  const dispatch = createEventDispatcher<{
    select: { type: string; id: string; name: string; collection: string }
    close: void
  }>()

  let query = ''
  let inputEl: HTMLInputElement

  $: filtered = collections.flatMap(c =>
    c.flows
      .filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
      .map(f => ({ type: 'flow', id: f.id, name: f.name, collection: c.name }))
  )

  onMount(() => {
    if (open) inputEl?.focus()
  })

  $: if (open) setTimeout(() => inputEl?.focus(), 50)

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close')
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="overlay"
    on:click={() => dispatch('close')}
    role="presentation"
    in:fadeScale={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-interactive-supports-focus -->
    <div
      class="palette"
      on:click|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      tabindex="-1"
    >
      <input
        bind:this={inputEl}
        bind:value={query}
        class="search"
        placeholder="Search flows, collections…"
        on:keydown={handleKey}
      />
      <div class="results">
        {#if filtered.length === 0}
          <div class="empty">No results{query ? ` for "${query}"` : ''}</div>
        {:else}
          {#each filtered as item}
            <button
              class="result-item"
              on:click={() => {
                dispatch('select', item)
                dispatch('close')
              }}
            >
              <span class="result-icon">⚡</span>
              <span class="result-name">{item.name}</span>
              <span class="result-meta">{item.collection}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 80px;
  }

  .palette {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    width: 480px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .search {
    width: 100%;
    padding: 14px 16px;
    border: none;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-md);
    outline: none;
    background: var(--surface);
    color: var(--text-primary);
    font-family: var(--font-sans);
    box-sizing: border-box;
  }

  .search::placeholder {
    color: var(--text-muted);
  }

  .results {
    max-height: 320px;
    overflow-y: auto;
  }

  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--dur-fast);
    font-family: var(--font-sans);
  }

  .result-item:hover {
    background: var(--bg);
  }

  .result-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .result-name {
    font-size: var(--text-md);
    color: var(--text-primary);
    font-weight: 500;
    flex: 1;
  }

  .result-meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .empty {
    padding: 20px 16px;
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }
</style>
