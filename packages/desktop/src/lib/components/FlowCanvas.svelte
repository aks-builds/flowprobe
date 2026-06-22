<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import StepCard from './StepCard.svelte'
  import StepTypePicker from './StepTypePicker.svelte'
  import EventStreamDrawer from './EventStreamDrawer.svelte'
  import type { LogEntry } from './EventStreamDrawer.svelte'
  import TopologyCanvas from './topology/TopologyCanvas.svelte'
  import { runStore } from '../stores/collection.js'
  import type { ValidationError } from '../stores/collection.js'
  import type { Flow } from '@flowprobe/core'
  import type { FlowRunResult } from '@flowprobe/core'

  let {
    flow,
    result = undefined,
    selectedStepId = null,
    logs = [],
    validationErrors = [],
  }: {
    flow: Flow
    result?: FlowRunResult
    selectedStepId?: string | null
    logs?: LogEntry[]
    validationErrors?: ValidationError[]
  } = $props()

  const dispatch = createEventDispatcher<{
    selectStep: string
    addStep: string
    reorder: { fromIdx: number; toIdx: number }
    saveStep: Flow['steps'][number]
  }>()

  function getStepResult(stepId: string) {
    return $runStore.results.find(r => r.id === stepId)
  }

  // Minimal drag-reorder state
  let dragFromIdx: number | null = $state(null)

  function onDragStart(idx: number) {
    dragFromIdx = idx
  }

  function onDrop(toIdx: number) {
    if (dragFromIdx !== null && dragFromIdx !== toIdx) {
      dispatch('reorder', { fromIdx: dragFromIdx, toIdx })
    }
    dragFromIdx = null
  }

  // Run mode state
  let showTypePicker = $state(false)
  let drawerOpen = $state(true)

  // View toggle: 'edit' | 'topology'
  let canvasView = $state<'edit' | 'topology'>('edit')

  const isRunMode = $derived($runStore.state === 'running' || $runStore.state === 'done' || $runStore.state === 'aborted')
  const runResults = $derived($runStore.results)

  // Auto-switch to topology when run starts; back to edit on reset
  $effect(() => {
    if ($runStore.state === 'running' || $runStore.state === 'done') {
      canvasView = 'topology'
    }
    if ($runStore.state === 'idle') {
      canvasView = 'edit'
    }
  })
</script>

<!-- View toggle pill (only visible when a run has happened) -->
{#if $runStore.state !== 'idle'}
  <div class="view-toggle">
    <button class:active={canvasView === 'topology'} onclick={() => canvasView = 'topology'}>Topology</button>
    <button class:active={canvasView === 'edit'} onclick={() => canvasView = 'edit'}>Edit</button>
  </div>
{/if}

{#if canvasView === 'topology' && $runStore.state !== 'idle'}
  <TopologyCanvas {flow} {logs} />
{:else}
  <!-- EDIT MODE: existing pipeline + type picker -->
  <div class="canvas">
    <div class="canvas-header">
      <h2 class="canvas-title">{flow.name}</h2>

      {#if result}
        <span class="run-tag" class:pass={result.passed} class:fail={!result.passed}>
          {result.passed ? '✓' : '✕'}
          {result.steps.filter(s => s.passed).length}/{result.steps.length} passed
          · {result.durationMs}ms
        </span>
      {:else}
        <span class="run-tag idle">{flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}</span>
      {/if}
    </div>

    <!-- Horizontal step track -->
    <div class="flow-track">
      {#each flow.steps as step, i (step.id)}
        {#if i > 0}
          <div class="flow-connector" aria-hidden="true">
            <span class="connector-line"></span>
            <span class="connector-arrow">▶</span>
          </div>
        {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="step-wrapper"
          role="listitem"
          draggable="true"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => e.preventDefault()}
          ondrop={(e) => { e.preventDefault(); onDrop(i) }}
        >
          <StepCard
            {step}
            result={getStepResult(step.id)}
            selected={selectedStepId === step.id}
            hasError={validationErrors.some(e => e.stepId === step.id)}
            on:select={() => dispatch('selectStep', step.id)}
            on:save={e => dispatch('saveStep', e.detail)}
            on:delete
            on:duplicate
          />
        </div>
      {/each}

      <!-- Add step button -->
      <button
        class="add-step"
        title="Add a new step"
        onclick={() => showTypePicker = !showTypePicker}
      >
        + Add step
      </button>
    </div>

    {#if showTypePicker}
      <StepTypePicker
        on:pick={e => { dispatch('addStep', e.detail); showTypePicker = false }}
        on:cancel={() => showTypePicker = false}
      />
    {/if}
  </div>
{/if}

<style>
  /* ── EDIT MODE ────────────────────────────────────────────── */
  .canvas {
    flex: 1;
    background: var(--bg);
    padding: var(--space-6);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .canvas-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .canvas-title {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .run-tag {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 500;
  }

  .run-tag.pass {
    background: var(--success-light);
    color: var(--success);
  }

  .run-tag.fail {
    background: var(--error-light);
    color: var(--error);
  }

  .run-tag.idle {
    background: var(--bg);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .flow-track {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: wrap;
    row-gap: var(--space-3);
  }

  .step-wrapper {
    cursor: grab;
  }

  .step-wrapper:active {
    cursor: grabbing;
  }

  .flow-connector {
    display: flex;
    align-items: center;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .connector-line {
    display: block;
    width: 24px;
    height: 1.5px;
    background: var(--border);
  }

  .connector-arrow {
    font-size: 10px;
    color: var(--text-muted);
    line-height: 1;
  }

  .add-step {
    font-size: var(--text-sm);
    color: var(--text-muted);
    background: var(--bg);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    margin-left: var(--space-2);
    align-self: center;
    transition: border-color var(--dur-fast), color var(--dur-fast);
    font-family: var(--font-sans);
  }

  .add-step:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .add-step:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ── VIEW TOGGLE ──────────────────────────────────────────── */
  .view-toggle {
    position: absolute; top: 40px; right: 14px; z-index: 15;
    display: flex; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32);
    border-radius: 8px; overflow: hidden;
  }
  .view-toggle button {
    padding: 4px 12px; font-size: 9.5px; background: none; border: none; cursor: pointer;
    color: var(--text-muted, #334155); transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
    font-family: var(--font-sans);
  }
  .view-toggle button.active { background: rgba(99,102,241,.15); color: #a5b4fc; font-weight: 700; }
  @media (prefers-reduced-motion: reduce) { .view-toggle button { transition: none; } }
</style>
