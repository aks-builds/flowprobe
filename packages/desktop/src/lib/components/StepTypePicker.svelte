<!-- packages/desktop/src/lib/components/StepTypePicker.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  type StepType = 'producer' | 'wait' | 'http-assert' | 'db-assert' | 'message-assert'
  const dispatch = createEventDispatcher<{ pick: StepType; cancel: void }>()

  const STEPS: { type: StepType; label: string; desc: string; color: string; icon: string }[] = [
    { type: 'producer',       label: 'Producer',       desc: 'Publish a message to a broker topic',            color: '#d97706', icon: '↑' },
    { type: 'wait',           label: 'Wait',           desc: 'Wait for a consumer to receive the message',     color: '#6d28d9', icon: '⏳' },
    { type: 'http-assert',    label: 'HTTP Assert',    desc: 'Make an HTTP request and assert the response',   color: '#0284c7', icon: '⚡' },
    { type: 'db-assert',      label: 'DB Assert',      desc: 'Run a SQL query and assert row/cell values',     color: '#0891b2', icon: '🗄' },
    { type: 'message-assert', label: 'Message Assert', desc: 'Assert a downstream message was emitted',        color: '#059669', icon: '📨' },
  ]

  let query = ''
  let highlighted = 0
  let inputEl: HTMLInputElement

  onMount(() => inputEl?.focus())

  $: filtered = STEPS.filter(s =>
    s.label.toLowerCase().includes(query.toLowerCase()) ||
    s.type.includes(query.toLowerCase())
  )
  $: query, (highlighted = 0)

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, filtered.length - 1) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0) }
    if (e.key === 'Enter' && filtered[highlighted]) dispatch('pick', filtered[highlighted].type)
    if (e.key === 'Escape') dispatch('cancel')
  }
</script>

<div class="picker" in:fadeScale={{ duration: 120 }} role="dialog" aria-label="Choose step type">
  <input
    bind:this={inputEl}
    bind:value={query}
    on:keydown={handleKey}
    class="search"
    placeholder="Filter step types…"
    aria-label="Search step types"
  />
  <ul class="list" role="listbox">
    {#each filtered as step, i (step.type)}
      <li
        class="item"
        class:highlighted={i === highlighted}
        role="option"
        aria-selected={i === highlighted}
        on:click={() => dispatch('pick', step.type)}
        on:keydown={e => e.key === 'Enter' && dispatch('pick', step.type)}
        on:mouseenter={() => highlighted = i}
        tabindex="-1"
      >
        <span class="item-icon" style="color:{step.color}">{step.icon}</span>
        <span class="item-body">
          <span class="item-label" style="color:{step.color}">{step.label}</span>
          <span class="item-desc">{step.desc}</span>
        </span>
      </li>
    {/each}
    {#if filtered.length === 0}
      <li class="empty">No step types match "{query}"</li>
    {/if}
  </ul>
</div>

<style>
  .picker { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); width: 280px; overflow: hidden; }
  .search { width: 100%; border: none; border-bottom: 1px solid var(--border); padding: 9px 12px; font-size: var(--text-sm); outline: none; background: var(--surface); color: var(--text-primary); box-sizing: border-box; }
  .search::placeholder { color: var(--text-muted); }
  .list { list-style: none; margin: 0; padding: 4px 0; max-height: 240px; overflow-y: auto; }
  .item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; }
  .item.highlighted { background: var(--bg); }
  .item-icon { width: 20px; text-align: center; font-size: 14px; flex-shrink: 0; }
  .item-body { display: flex; flex-direction: column; }
  .item-label { font-size: var(--text-sm); font-weight: 600; }
  .item-desc { font-size: var(--text-xs); color: var(--text-muted); margin-top: 1px; }
  .empty { padding: 12px; font-size: var(--text-sm); color: var(--text-muted); text-align: center; }
</style>
