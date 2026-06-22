<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { fadeScale, shake } from '../design/animations.js'
  import type { Step } from '@flowprobe/core'
  import type { StepRunResult } from '@flowprobe/core'
  import ValidationBadge from './ValidationBadge.svelte'

  export let step: Step
  export let result: StepRunResult | undefined = undefined
  export let selected = false
  export let hasError = false

  const dispatch = createEventDispatcher<{ select: void; delete: void; duplicate: void; save: Step }>()

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

  // --- Inline editor state ---
  let editing = false
  let editTopic = ''
  let editBroker = ''
  let editUrl = ''
  let editTimeout = 5000
  let fieldErrors: Record<string, string> = {}

  function startEdit() {
    editing = true
    if (step.type === 'producer') { editTopic = step.topic; editBroker = step.broker }
    if (step.type === 'wait') { editTimeout = step.timeoutMs }
    if (step.type === 'http-assert') { editUrl = step.url }
    fieldErrors = {}
  }

  function validateFields() {
    fieldErrors = {}
    if (step.type === 'producer') {
      if (!editBroker) fieldErrors.broker = 'Required — select a connected broker'
      if (!editTopic)  fieldErrors.topic  = 'Required — enter a topic name'
    }
    if (step.type === 'wait' && editTimeout <= 0) fieldErrors.timeoutMs = 'Must be > 0'
    if (step.type === 'http-assert' && (!editUrl || (!editUrl.startsWith('http://') && !editUrl.startsWith('https://')))) {
      fieldErrors.url = 'Must start with http:// or https://'
    }
    return Object.keys(fieldErrors).length === 0
  }

  function saveEdit() {
    if (!validateFields()) return
    dispatch('save', {
      ...step,
      ...(step.type === 'producer' ? { topic: editTopic, broker: editBroker } : {}),
      ...(step.type === 'wait' ? { timeoutMs: editTimeout } : {}),
      ...(step.type === 'http-assert' ? { url: editUrl } : {}),
    } as Step)
    editing = false
  }

  function cancelEdit() { editing = false; fieldErrors = {} }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancelEdit()
  }

  function handleCardClick() {
    dispatch('select')
    if (selected) startEdit()
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
  on:click={handleCardClick}
  on:dblclick={startEdit}
  on:keydown={e => e.key === 'Enter' && dispatch('select')}
>
  {#if hasError && !editing}
    <div class="error-corner-dot" aria-label="Step has validation errors"></div>
  {/if}

  {#if selected && editing}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="inline-editor" on:keydown={handleKeydown} role="form" aria-label="Edit step">
      <div class="ie-header">✎ Editing: {step.id}</div>
      {#if step.type === 'producer'}
        <div class="ie-field">
          <label class="ie-label">Broker</label>
          <input class="ie-input" class:ie-error={!!fieldErrors.broker} bind:value={editBroker} placeholder="&#123;&#123;KAFKA_BROKER_ID&#125;&#125;" on:input={validateFields} />
          <ValidationBadge error={fieldErrors.broker ?? null} />
        </div>
        <div class="ie-field">
          <label class="ie-label">Topic</label>
          <input class="ie-input" class:ie-error={!!fieldErrors.topic} bind:value={editTopic} placeholder="order-events" on:input={validateFields} />
          <ValidationBadge error={fieldErrors.topic ?? null} />
        </div>
      {/if}
      {#if step.type === 'wait'}
        <div class="ie-field">
          <label class="ie-label">Timeout (ms)</label>
          <input class="ie-input" class:ie-error={!!fieldErrors.timeoutMs} type="number" bind:value={editTimeout} min="1" on:input={validateFields} />
          <ValidationBadge error={fieldErrors.timeoutMs ?? null} />
        </div>
      {/if}
      {#if step.type === 'http-assert'}
        <div class="ie-field">
          <label class="ie-label">URL</label>
          <input class="ie-input" class:ie-error={!!fieldErrors.url} bind:value={editUrl} placeholder="https://api.example.com/status" on:input={validateFields} />
          <ValidationBadge error={fieldErrors.url ?? null} />
        </div>
      {/if}
      <div class="ie-actions">
        <button class="ie-save" on:click={saveEdit} disabled={Object.keys(fieldErrors).length > 0}>Save</button>
        <button class="ie-cancel" on:click={cancelEdit}>Cancel</button>
      </div>
      <div class="ie-hint">↵ save · Esc cancel · Tab next field</div>
    </div>
  {:else}
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
        title="Edit"
        on:click|stopPropagation={startEdit}
      >✎</button>
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
  {/if}
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

  /* Error corner dot — shown when hasError && !editing */
  .error-corner-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--error);
    pointer-events: none;
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

  /* Inline editor */
  .inline-editor {
    padding: 8px 10px;
    border-top: 1px solid var(--accent-light);
  }

  .ie-header {
    font-size: var(--text-xs);
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 7px;
  }

  .ie-field {
    margin-bottom: 6px;
  }

  .ie-label {
    font-size: 9px;
    color: var(--text-muted);
    display: block;
    margin-bottom: 2px;
  }

  .ie-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 6px;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    background: var(--bg);
    color: var(--text-primary);
    box-sizing: border-box;
  }

  .ie-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .ie-input.ie-error {
    border-color: var(--error);
  }

  .ie-actions {
    display: flex;
    gap: 5px;
    margin-top: 7px;
  }

  .ie-save {
    flex: 1;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .ie-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ie-cancel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .ie-hint {
    font-size: 8px;
    color: var(--text-muted);
    margin-top: 4px;
    font-family: var(--font-mono);
  }
</style>
