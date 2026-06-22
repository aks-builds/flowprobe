<!-- packages/desktop/src/lib/components/ResultPanel.svelte -->
<script lang="ts">
  import { fadeScale } from '../design/animations.js'
  import type { FlowRunResult, StepRunResult } from '@flowprobe/core'
  import type { Step } from '@flowprobe/core'
  import { runStore } from '../stores/collection.js'

  export let result: FlowRunResult | null = null
  export let selectedStepId: string | null = null
  export let selectedStep: Step | null = null

  $: maxDuration = result ? Math.max(...result.steps.map(s => s.durationMs), 1) : 1

  let activeTab: 'results' | 'config' | 'payload' = 'results'

  // Spark-line: last 6 run durations per step ID
  let sparkData: Map<string, number[]> = new Map()
  let runCount = 0

  // Update spark data when run completes
  $: if ($runStore.state === 'done') {
    runCount++
    for (const r of $runStore.results) {
      const prev = sparkData.get(r.id) ?? []
      sparkData.set(r.id, [...prev.slice(-5), r.durationMs])
    }
    sparkData = new Map(sparkData) // trigger reactivity
  }

  $: results = $runStore.results
  $: maxRunDuration = results.length > 0 ? Math.max(...results.map(r => r.durationMs), 1) : 1

  function sparkHeight(val: number, allVals: number[]): number {
    const max = Math.max(...allVals, 1)
    return Math.round((val / max) * 16)
  }
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

      {#if results.length > 0}
        <div class="sparks-section">
          <div class="section-label">Timing history (last {Math.max(...[...sparkData.values()].map(v => v.length), 0)} runs)</div>
          {#each results as r (r.id)}
            {@const vals = sparkData.get(r.id) ?? [r.durationMs]}
            <div class="spark-row">
              <div class="spark-name" title={r.id}>{r.id}</div>
              <div class="spark-chart">
                {#each vals as val}
                  <div class="spark-bar"
                    style="height:{sparkHeight(val, vals)}px;background:{r.passed ? 'var(--accent)' : 'var(--error)'}">
                  </div>
                {/each}
              </div>
              <div class="spark-val">{r.durationMs}ms</div>
            </div>
          {/each}
        </div>
        <div class="run-counter">
          <div class="rc-num" class:pass={results.every(r => r.passed)} class:fail={results.some(r => !r.passed)}>#{runCount}</div>
          <div class="rc-label">Run Count</div>
        </div>
      {/if}
    {:else if activeTab === 'config'}
      {#if selectedStep}
        <div class="config-section">
          <div class="config-step-title">{selectedStep.type} · {selectedStep.id}</div>
          <div class="config-field"><span class="cf-label">ID</span><span class="cf-value">{selectedStep.id}</span></div>
          {#if selectedStep.type === 'producer'}
            <div class="config-field"><span class="cf-label">Broker</span><span class="cf-value cf-mono">{(selectedStep as any).broker}</span></div>
            <div class="config-field"><span class="cf-label">Topic</span><span class="cf-value cf-mono">{(selectedStep as any).topic}</span></div>
          {/if}
          {#if selectedStep.type === 'wait'}
            <div class="config-field"><span class="cf-label">Timeout</span><span class="cf-value cf-mono">{(selectedStep as any).timeoutMs}ms</span></div>
          {/if}
          {#if selectedStep.type === 'http-assert'}
            <div class="config-field"><span class="cf-label">Method</span><span class="cf-value cf-mono">{(selectedStep as any).method}</span></div>
            <div class="config-field"><span class="cf-label">URL</span><span class="cf-value cf-mono" title={(selectedStep as any).url}>{(selectedStep as any).url}</span></div>
            <div class="config-field"><span class="cf-label">Assertions</span><span class="cf-value">{(selectedStep as any).assertions?.length ?? 0}</span></div>
          {/if}
        </div>
      {:else}
        <div class="empty">Click a step to see its configuration</div>
      {/if}
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
    transition: width var(--dur-normal) ease-out;
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

  /* ── Spark-lines ── */
  .sparks-section { margin-bottom: 10px; }
  .section-label { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 7px; font-weight: 600; }
  .spark-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .spark-name { font-size: 9px; color: var(--text-secondary); width: 70px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
  .spark-chart { display: flex; align-items: flex-end; gap: 2px; flex: 1; height: 18px; }
  .spark-bar { width: 5px; border-radius: 1.5px 1.5px 0 0; flex-shrink: 0; }
  .spark-val { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); width: 36px; text-align: right; flex-shrink: 0; }
  .run-counter { background: var(--bg); border-radius: var(--radius-md); padding: 10px; text-align: center; margin-top: 10px; }
  .rc-num { font-size: 22px; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); }
  .rc-num.pass { color: var(--success); }
  .rc-num.fail { color: var(--error); }
  .rc-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; }

  /* ── Config tab ── */
  .config-section { }
  .config-step-title { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
  .config-field { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--bg); }
  .cf-label { font-size: var(--text-xs); color: var(--text-muted); width: 60px; flex-shrink: 0; }
  .cf-value { font-size: var(--text-sm); color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cf-mono { font-family: var(--font-mono); }

  @media (prefers-reduced-motion: reduce) {
    .timing-fill {
      transition: none;
    }
  }
</style>
