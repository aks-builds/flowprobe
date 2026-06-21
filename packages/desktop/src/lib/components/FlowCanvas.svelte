<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import StepCard from './StepCard.svelte'
  import type { Flow } from '@flowprobe/core'
  import type { FlowRunResult } from '@flowprobe/core'

  export let flow: Flow
  export let result: FlowRunResult | undefined = undefined
  export let selectedStepId: string | null = null

  const dispatch = createEventDispatcher<{
    selectStep: string
    addStep: void
    reorder: { fromIdx: number; toIdx: number }
  }>()

  function getStepResult(stepId: string) {
    return result?.steps.find(s => s.id === stepId)
  }

  // Minimal drag-reorder state
  let dragFromIdx: number | null = null

  function onDragStart(idx: number) {
    dragFromIdx = idx
  }

  function onDrop(toIdx: number) {
    if (dragFromIdx !== null && dragFromIdx !== toIdx) {
      dispatch('reorder', { fromIdx: dragFromIdx, toIdx })
    }
    dragFromIdx = null
  }
</script>

<div class="canvas">
  <!-- Header row: flow name + run result tag -->
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

      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="step-wrapper"
        draggable="true"
        on:dragstart={() => onDragStart(i)}
        on:dragover|preventDefault
        on:drop|preventDefault={() => onDrop(i)}
      >
        <StepCard
          {step}
          result={getStepResult(step.id)}
          selected={selectedStepId === step.id}
          on:select={() => dispatch('selectStep', step.id)}
          on:delete
          on:duplicate
        />
      </div>
    {/each}

    <!-- Add step button -->
    <button
      class="add-step"
      title="Add a new step"
      on:click={() => dispatch('addStep')}
    >
      + Add step
    </button>
  </div>
</div>

<style>
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
    /* Drag handle cursor when not hovering a card button */
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
</style>
