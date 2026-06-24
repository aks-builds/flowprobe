<script lang="ts">
  import { runStore } from '../../stores/collection.js'
  import { diffStore } from '../../stores/dock.js'
  import type { Flow } from '@flowprobe/core'

  let { activeFlow }: { activeFlow: Flow | null } = $props()

  let mode = $state<'expected-actual' | 'compare-runs'>('expected-actual')

  $: currentResults = $runStore.results
  $: previousResults = $diffStore.previous?.results ?? []
</script>

<div class="diff-tab">
  <div class="diff-header">
    <div class="diff-toggle">
      <button class:active={mode === 'expected-actual'} onclick={() => mode = 'expected-actual'}>Expected vs Actual</button>
      <button class:active={mode === 'compare-runs'} onclick={() => mode = 'compare-runs'}>Compare Runs</button>
    </div>
  </div>

  {#if currentResults.length === 0}
    <div class="empty">Run the collection to see the diff</div>
  {:else if mode === 'expected-actual'}
    <div class="diff-cols">
      <div class="col">
        <div class="col-title exp">Expected</div>
        {#each activeFlow?.steps ?? [] as step}
          <div class="ev-block match">
            <div class="ev-name">{step.type} · {step.id}</div>
            <div class="ev-detail">as defined in collection</div>
          </div>
        {/each}
      </div>
      <div class="col">
        <div class="col-title act">Actual (Run #{$runStore.results.length > 0 ? 'current' : '—'})</div>
        {#each currentResults as r}
          <div class="ev-block" class:pass={r.passed} class:fail={!r.passed}>
            <div class="ev-name" class:text-pass={r.passed} class:text-fail={!r.passed}>{r.passed ? '✓' : '✕'} {r.id}</div>
            <div class="ev-detail">{r.durationMs}ms · {r.passed ? 'passed' : (r.error ?? 'failed')}</div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Compare runs mode -->
    {#if !$diffStore.previous}
      <div class="empty">Need at least 2 runs to compare. Run the collection again.</div>
    {:else}
      <div class="diff-cols">
        <div class="col">
          <div class="col-title exp">Previous Run</div>
          {#each previousResults as r}
            <div class="ev-block match">
              <div class="ev-name">{r.id}</div>
              <div class="ev-detail">{r.durationMs}ms · {r.passed ? 'pass' : 'fail'}</div>
            </div>
          {/each}
        </div>
        <div class="col">
          <div class="col-title act">Current Run</div>
          {#each currentResults as r, i}
            {@const prev = previousResults[i]}
            {@const faster = prev && r.durationMs < prev.durationMs}
            {@const slower = prev && r.durationMs > prev.durationMs}
            <div class="ev-block" class:pass={r.passed} class:fail={!r.passed}>
              <div class="ev-name" class:text-pass={r.passed} class:text-fail={!r.passed}>{r.id}</div>
              <div class="ev-detail">
                {r.durationMs}ms
                {#if faster}<span class="delta-better">↑ {prev.durationMs - r.durationMs}ms faster</span>
                {:else if slower}<span class="delta-worse">↓ {r.durationMs - prev.durationMs}ms slower</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .diff-tab { padding: 10px; }
  .diff-header { margin-bottom: 10px; }
  .diff-toggle { display: flex; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); border-radius: 7px; overflow: hidden; }
  .diff-toggle button { padding: 4px 11px; font-size: 9.5px; background: none; border: none; cursor: pointer; color: var(--text-muted, #334155); }
  .diff-toggle button.active { background: rgba(99,102,241,.15); color: #a5b4fc; font-weight: 700; }
  .empty { font-size: 10px; color: var(--text-muted, #334155); padding: 16px; text-align: center; }
  .diff-cols { display: flex; gap: 6px; }
  .col { flex: 1; }
  .col-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 8px; padding: 2px 4px; }
  .col-title.exp { color: #818cf8; }
  .col-title.act { color: #4ade80; }
  .ev-block { background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); border-radius: 7px; padding: 7px 9px; margin-bottom: 6px; font-size: 9px; }
  .ev-block.match { border-left: 2px solid rgba(99,102,241,.4); }
  .ev-block.pass { border-left: 2px solid rgba(34,197,94,.5); background: rgba(34,197,94,.04); }
  .ev-block.fail { border-left: 2px solid rgba(239,68,68,.5); background: rgba(239,68,68,.04); }
  .ev-name { font-weight: 700; color: var(--text-secondary, #94a3b8); font-size: 9.5px; margin-bottom: 2px; }
  .ev-name.text-pass { color: #4ade80; }
  .ev-name.text-fail { color: #f87171; }
  .ev-detail { color: var(--text-muted, #334155); font-family: var(--font-mono, monospace); }
  .delta-better { color: #4ade80; margin-left: 5px; }
  .delta-worse { color: #f87171; margin-left: 5px; }
</style>
