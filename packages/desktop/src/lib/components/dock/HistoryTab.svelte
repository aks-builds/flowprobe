<script lang="ts">
  import { onMount } from 'svelte'
  import { historyStore } from '../../stores/history.js'
  import { dockTabStore } from '../../stores/dock.js'

  onMount(() => historyStore.load())
</script>

<div class="history-tab">
  {#if $historyStore.length === 0}
    <div class="empty">No runs recorded yet</div>
  {:else}
    {#each $historyStore as r (r.runId)}
      <div class="hist-row">
        <div class="hist-dot" class:pass={r.failed === 0} class:fail={r.failed > 0}></div>
        <div class="hist-info">
          <div class="hist-flow">{r.flowName}</div>
          <div class="hist-meta">{r.collectionName} · {r.environment ?? 'no env'} · {new Date(r.startedAt).toLocaleTimeString()}</div>
        </div>
        <div class="hist-right">
          <div class="hist-dur">{r.durationMs}ms</div>
          <div class="hist-status" class:pass={r.failed === 0} class:fail={r.failed > 0}>
            {r.failed === 0 ? '✓' : `${r.failed} failed`}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .history-tab { padding: 10px; }
  .empty { font-size: 10px; color: var(--text-muted, #334155); padding: 16px; text-align: center; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border, #161628); }
  .hist-row:last-child { border-bottom: none; }
  .hist-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .hist-dot.pass { background: var(--success, #22c55e); }
  .hist-dot.fail { background: var(--error, #ef4444); }
  .hist-info { flex: 1; overflow: hidden; }
  .hist-flow { font-size: 10.5px; color: var(--text-secondary, #94a3b8); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hist-meta { font-size: 8.5px; color: var(--text-muted, #334155); margin-top: 1px; }
  .hist-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .hist-dur { font-size: 9px; font-family: var(--font-mono, monospace); color: var(--text-muted, #334155); }
  .hist-status { font-size: 9px; font-weight: 700; }
  .hist-status.pass { color: var(--success, #22c55e); }
  .hist-status.fail { color: var(--error, #ef4444); }
</style>
