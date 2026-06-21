<!-- packages/desktop/src/lib/components/ResultPanel.svelte -->
<script lang="ts">
  import { fadeScale } from '../design/animations.js'
  import type { FlowRunResult, StepRunResult } from '@flowprobe/core'

  export let result: FlowRunResult | null = null
  export let selectedStepId: string | null = null

  $: selectedStep = result?.steps.find(s => s.id === selectedStepId) ?? null
  $: maxDuration = result ? Math.max(...result.steps.map(s => s.durationMs), 1) : 1

  let activeTab: 'results' | 'config' | 'payload' = 'results'
</script>

<div class="panel">
  <div class="tabs">
    {#each ['results', 'config', 'payload'] as tab}
      <button
        class="tab"
        class:active={activeTab === tab}
        on:click={() => activeTab = tab as typeof activeTab}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    {/each}
  </div>

  <div class="panel-body">
    {#if activeTab === 'results'}
      {#if result}
        <div class="result-header" in:fadeScale>
          <span class="badge" class:pass={result.passed} class:fail={!result.passed}>
            {result.passed ? 'PASSED' : 'FAILED'}
          </span>
          <span class="time">{result.durationMs}ms</span>
        </div>

        <div class="timing-bar">
          <div class="timing-label">Step timings</div>
          {#each result.steps as step}
            <div class="timing-row">
              <div class="timing-name">{step.id}</div>
              <div class="timing-track-wrap">
                <div class="timing-track">
                  <div
                    class="timing-fill"
                    style="width:{(step.durationMs / maxDuration) * 100}%;background:{step.passed ? 'var(--accent)' : 'var(--error)'}"
                  ></div>
                </div>
              </div>
              <div class="timing-val">{step.durationMs}ms</div>
            </div>
          {/each}
        </div>

        {#each result.steps as step}
          <div class="assertion-row" class:fail={!step.passed} in:fadeScale={{ delay: 50 }}>
            <div class="ar-icon" class:pass={step.passed} class:fail={!step.passed}>
              {step.passed ? '✓' : '✕'}
            </div>
            <div class="ar-body">
              <div class="ar-name">{step.id}</div>
              {#if step.error}<div class="ar-error">{step.error}</div>{/if}
              <div class="ar-detail">{step.durationMs}ms · {step.type}</div>
            </div>
          </div>
        {/each}
      {:else}
        <div class="empty">Run the collection to see results</div>
      {/if}
    {:else if activeTab === 'config'}
      <div class="empty">Select a step to configure it</div>
    {:else}
      <div class="empty">Run a flow to see raw payload</div>
    {/if}
  </div>
</div>

<style>
  .panel {
    width: 260px;
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }

  .tab {
    flex: 1;
    padding: 10px 4px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    border: none;
    background: none;
    border-bottom: 2px solid transparent;
    transition: color var(--dur-fast), border-color var(--dur-fast);
    font-family: var(--font-sans);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3);
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }

  .badge {
    padding: 3px 10px;
    border-radius: 10px;
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .badge.pass {
    background: var(--success-light);
    color: var(--success);
  }

  .badge.fail {
    background: var(--error-light);
    color: var(--error);
  }

  .time {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .timing-bar {
    background: var(--bg);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    margin-bottom: 10px;
  }

  .timing-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .timing-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .timing-name {
    font-size: 9px;
    color: var(--text-secondary);
    width: 80px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timing-track-wrap {
    flex: 1;
  }

  .timing-track {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
  }

  .timing-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 400ms ease-out;
  }

  .timing-val {
    font-size: 9px;
    color: var(--text-muted);
    width: 40px;
    text-align: right;
  }

  .assertion-row {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    margin-bottom: 6px;
    display: flex;
    gap: 8px;
  }

  .assertion-row.fail {
    border-color: #fecaca;
  }

  .ar-icon {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .ar-icon.pass {
    background: #dcfce7;
    color: var(--success);
  }

  .ar-icon.fail {
    background: #fee2e2;
    color: var(--error);
  }

  .ar-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .ar-error {
    font-size: var(--text-xs);
    color: var(--error);
    margin-top: 2px;
  }

  .ar-detail {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .empty {
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
    margin-top: 40px;
  }
</style>
