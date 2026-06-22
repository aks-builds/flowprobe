<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { runStore } from '../../stores/collection.js'

  const dispatch = createEventDispatcher<{ compareRuns: void }>()

  let message = $state('')
  let visible = $state(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    if ($runStore.state === 'done' && $runStore.results.length > 0) {
      message = buildInsight($runStore.results)
      visible = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { visible = false }, 8000)
    }
  })

  function buildInsight(results: typeof $runStore.results): string {
    const failed = results.filter(r => !r.passed)
    if (failed.length > 0) return `${failed.length} step${failed.length > 1 ? 's' : ''} failed — click nodes for details`
    const total = results.reduce((s, r) => s + r.durationMs, 0)
    return `All steps passed · ${total}ms total`
  }

  onDestroy(() => { if (timer) clearTimeout(timer) })
</script>

{#if visible}
  <div class="insight-bar" role="status">
    <span class="ib-icon" aria-hidden="true">💡</span>
    <span class="ib-msg">{message}</span>
    <button class="ib-action" onclick={() => dispatch('compareRuns')}>Compare runs →</button>
    <button class="ib-dismiss" onclick={() => { visible = false }} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .insight-bar {
    background: rgba(245,158,11,.08);
    border-top: 1px solid rgba(245,158,11,.18);
    padding: 7px 14px;
    font-size: 9.5px;
    color: #fcd34d;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    animation: slide-up var(--dur-fast, 150ms) var(--ease-out, ease-out);
  }
  @keyframes slide-up { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .insight-bar { animation: none; } }

  .ib-icon { font-size: 13px; flex-shrink: 0; }
  .ib-msg { flex: 1; }
  .ib-action {
    background: rgba(245,158,11,.2); color: #fcd34d;
    border: 1px solid rgba(245,158,11,.35); padding: 2px 8px;
    border-radius: 5px; font-size: 8.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
  }
  .ib-dismiss { background: none; border: none; color: rgba(245,158,11,.5); cursor: pointer; font-size: 10px; }
</style>
