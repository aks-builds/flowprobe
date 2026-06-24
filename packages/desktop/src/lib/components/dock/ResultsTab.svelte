<!-- packages/desktop/src/lib/components/dock/ResultsTab.svelte -->
<script lang="ts">
  import { fadeScale } from '../../design/animations.js'
  import { runStore } from '../../stores/collection.js'

  // Spark-line: last 6 run durations per step ID
  let sparkData = $state<Map<string, number[]>>(new Map())
  let runCount = $state(0)

  // Update spark data when run completes
  $effect(() => {
    if ($runStore.state === 'done') {
      runCount++
      for (const r of $runStore.results) {
        const prev = sparkData.get(r.id) ?? []
        sparkData.set(r.id, [...prev.slice(-5), r.durationMs])
      }
      sparkData = new Map(sparkData) // trigger reactivity
    }
  })

  let results = $derived($runStore.results)

  // Determine overall pass/fail and total duration from the last completed run
  let overallPassed = $derived(results.length > 0 ? results.every(r => r.passed) : null)
  let totalDuration = $derived(results.reduce((acc, r) => acc + r.durationMs, 0))
  let maxDuration = $derived(results.length > 0 ? Math.max(...results.map(r => r.durationMs), 1) : 1)

  function sparkHeight(val: number, allVals: number[]): number {
    const max = Math.max(...allVals, 1)
    return Math.round((val / max) * 16)
  }
</script>

<div class="results-tab">
  {#if results.length > 0}
    <!-- Summary badge + total duration -->
    <div class="result-header" in:fadeScale>
      <span class="badge" class:pass={overallPassed === true} class:fail={overallPassed === false}>
        {overallPassed === true ? 'PASSED' : overallPassed === false ? 'FAILED' : '—'}
      </span>
      <span class="time">{totalDuration}ms</span>
    </div>

    <!-- Timing bars per step -->
    <div class="timing-bar">
      <div class="timing-label">Step timings</div>
      {#each results as step}
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

    <!-- Step result cards -->
    {#each results as step}
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

    <!-- Spark-line timing history -->
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

    <!-- Run counter -->
    <div class="run-counter">
      <div class="rc-num" class:pass={results.every(r => r.passed)} class:fail={results.some(r => !r.passed)}>#{runCount}</div>
      <div class="rc-label">Run Count</div>
    </div>
  {:else}
    <div class="empty">Run the collection to see results</div>
  {/if}
</div>

<style>
  .results-tab {
    padding: var(--space-3);
    overflow-y: auto;
    flex: 1;
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

  @media (prefers-reduced-motion: reduce) {
    .timing-fill {
      transition: none;
    }
  }
</style>
