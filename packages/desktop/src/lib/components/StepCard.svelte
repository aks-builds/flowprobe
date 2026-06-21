<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { fadeScale, shake } from '../design/animations.js'
  import type { Step } from '@flowprobe/core'
  import type { StepRunResult } from '@flowprobe/core'

  export let step: Step
  export let result: StepRunResult | undefined = undefined
  export let selected = false

  const dispatch = createEventDispatcher<{ select: void; delete: void; duplicate: void }>()

  /** Apply shake only when result is explicitly failed; no-op otherwise. */
  function maybeShake(node: HTMLElement): { destroy(): void } {
    if (result?.passed === false) return shake(node)
    return { destroy() {} }
  }

  const typeColors: Record<string, string> = {
    producer: '#d97706',
    wait: '#6d28d9',
    'http-assert': '#0284c7',
    'db-assert': '#0891b2',
    'message-assert': '#059669',
  }

  const typeLabels: Record<string, string> = {
    producer: 'Producer',
    wait: 'Wait',
    'http-assert': 'HTTP Assert',
    'db-assert': 'DB Assert',
    'message-assert': 'Msg Assert',
  }

  function getDetail(s: Step): string {
    if (s.type === 'producer') return `topic: ${s.topic}`
    if (s.type === 'wait') return `timeout: ${s.timeoutMs}ms`
    if (s.type === 'http-assert') return `${s.method} ${s.url.slice(0, 28)}`
    if (s.type === 'db-assert') return s.query.slice(0, 28)
    if (s.type === 'message-assert') return `topic: ${s.topic}`
    return ''
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="step-card"
  class:selected
  class:passed={result?.passed === true}
  class:failed={result?.passed === false}
  role="button"
  tabindex="0"
  use:maybeShake
  in:fadeScale={{ duration: 150 }}
  on:click={() => dispatch('select')}
  on:keydown={e => e.key === 'Enter' && dispatch('select')}
>
  <div class="node-type" style="color: {typeColors[step.type] ?? '#64748b'}">
    {typeLabels[step.type] ?? step.type}
  </div>

  <div class="node-name">{step.id}</div>

  <div class="node-detail">{getDetail(step)}</div>

  {#if result !== undefined}
    <div class="node-badge" class:pass={result.passed} class:fail={!result.passed}>
      {result.passed ? '✓' : '✕'}
    </div>
  {/if}

  <div class="card-actions">
    <button
      class="action-btn"
      title="Duplicate"
      on:click|stopPropagation={() => dispatch('duplicate')}
    >⧉</button>
    <button
      class="action-btn action-btn--danger"
      title="Delete"
      on:click|stopPropagation={() => dispatch('delete')}
    >✕</button>
  </div>
</div>

<style>
  .step-card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px 14px;
    width: 155px;
    flex-shrink: 0;
    cursor: pointer;
    transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
    position: relative;
    user-select: none;
  }

  .step-card:hover {
    border-color: var(--accent);
  }

  .step-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .step-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .step-card.passed {
    border-color: #bbf7d0;
  }

  .step-card.failed {
    border-color: #fecaca;
  }

  /* Show action buttons on hover */
  .card-actions {
    display: none;
    position: absolute;
    top: 6px;
    right: 6px;
    gap: 2px;
    flex-direction: row;
  }

  .step-card:hover .card-actions {
    display: flex;
  }

  /* Hide the badge when hovering (actions take that corner) */
  .step-card:hover .node-badge {
    display: none;
  }

  .action-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    width: 18px;
    height: 18px;
    font-size: 9px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    padding: 0;
    line-height: 1;
  }

  .action-btn:hover {
    border-color: var(--border-hover);
    color: var(--text-secondary);
  }

  .action-btn--danger:hover {
    border-color: var(--error);
    color: var(--error);
  }

  .node-type {
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .node-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node-detail {
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
  }

  .node-badge.pass {
    background: #dcfce7;
    color: var(--success);
  }

  .node-badge.fail {
    background: #fee2e2;
    color: var(--error);
  }
</style>
