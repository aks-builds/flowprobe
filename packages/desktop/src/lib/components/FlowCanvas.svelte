<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import StepCard from './StepCard.svelte'
  import StepTypePicker from './StepTypePicker.svelte'
  import EventStreamDrawer from './EventStreamDrawer.svelte'
  import type { LogEntry } from './EventStreamDrawer.svelte'
  import { runStore } from '../stores/collection.js'
  import type { ValidationError } from '../stores/collection.js'
  import type { Flow } from '@flowprobe/core'
  import type { FlowRunResult } from '@flowprobe/core'

  export let flow: Flow
  export let result: FlowRunResult | undefined = undefined
  export let selectedStepId: string | null = null
  export let logs: LogEntry[] = []
  export let validationErrors: ValidationError[] = []

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

  // Run mode state
  let showTypePicker = false
  let drawerOpen = true

  $: isRunMode = $runStore.state === 'running' || $runStore.state === 'done' || $runStore.state === 'aborted'
  $: runResults = $runStore.results
</script>

{#if !isRunMode}
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
        on:click={() => showTypePicker = !showTypePicker}
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
{:else}
  <!-- RUN MODE: Vercel-style timeline -->
  <div class="run-mode">
    <div class="run-header">
      <span class="run-flow-name">{flow.name}</span>
      <div class="run-progress-wrap">
        <div class="run-bar">
          <div
            class="run-bar-fill"
            style="width:{$runStore.state === 'running' ? '60%' : '100%'};background:{$runStore.state === 'done' && $runStore.results.every(r => r.passed) ? 'var(--success)' : 'var(--accent)'}"
          ></div>
        </div>
      </div>
      <span class="run-step-count">
        {runResults.filter(r => r.passed).length + runResults.filter(r => !r.passed).length} / {flow.steps.length}
      </span>
    </div>

    <div class="timeline">
      {#each flow.steps as step (step.id)}
        {@const result = getStepResult(step.id)}
        {@const isActive = $runStore.state === 'running' && !result && flow.steps.indexOf(step) === runResults.length}
        <div class="t-row">
          <div
            class="t-dot"
            class:pass={result?.passed === true}
            class:fail={result?.passed === false}
            class:running={isActive}
            class:pending={!result && !isActive}
          >
            {#if result?.passed === true}✓{:else if result?.passed === false}✕{/if}
          </div>
          <div class="t-body">
            <div class="t-name">{step.type} · {step.id}</div>
            {#if result?.error}
              <div class="t-error">{result.error}</div>
            {:else if result}
              <div class="t-detail">
                {#if step.type === 'producer'}Published successfully{/if}
                {#if step.type === 'wait'}Consumer received message{/if}
                {#if step.type === 'http-assert'}HTTP assertion passed{/if}
              </div>
            {:else if isActive}
              <div class="t-detail t-running">running…</div>
            {/if}
          </div>
          {#if result}
            <div class="t-dur">{result.durationMs}ms</div>
          {/if}
        </div>
      {/each}
    </div>

    <EventStreamDrawer
      entries={logs}
      open={drawerOpen}
      liveCount={$runStore.state === 'running' ? 1 : 0}
      on:toggle={() => drawerOpen = !drawerOpen}
    />
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

  /* ── RUN MODE ─────────────────────────────────────────────── */
  .run-mode { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .run-header { padding: 10px 18px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .run-flow-name { font-size: var(--text-md); font-weight: 700; color: var(--text-primary); }
  .run-progress-wrap { flex: 1; }
  .run-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .run-bar-fill { height: 100%; border-radius: 2px; transition: width var(--dur-normal) ease, background var(--dur-fast) ease; }
  .run-step-count { font-size: var(--text-sm); color: var(--text-muted); font-family: var(--font-mono); }
  .timeline { flex: 1; padding: 12px 18px; overflow-y: auto; }
  .t-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; position: relative; }
  .t-row::after { content:''; position:absolute; left:8px; top:17px; bottom:-8px; width:1.5px; background:var(--border); }
  .t-row:last-child::after { display:none; }
  .t-dot { width: 17px; height: 17px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #fff; margin-top: 1px; background: var(--border); transition: background var(--dur-fast); }
  .t-dot.pass { background: var(--success); }
  .t-dot.fail { background: var(--error); }
  .t-dot.running { background: #3b82f6; animation: t-pulse var(--dur-slow) ease-in-out infinite; }
  .t-dot.pending { background: var(--border); }
  @keyframes t-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.4)} 50%{box-shadow:0 0 0 5px rgba(59,130,246,0)} }
  @media (prefers-reduced-motion: reduce) {
    .t-dot.running { animation: none; }
    .run-bar-fill { transition: none; }
  }
  .t-body { flex: 1; }
  .t-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
  .t-detail { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
  .t-error { font-size: var(--text-xs); color: var(--error); font-family: var(--font-mono); margin-top: 2px; }
  .t-running { color: #3b82f6; }
  .t-dur { font-size: var(--text-xs); color: var(--text-secondary); font-family: var(--font-mono); white-space: nowrap; }
</style>
