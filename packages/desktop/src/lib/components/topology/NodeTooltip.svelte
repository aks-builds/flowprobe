<script lang="ts">
  import type { TopologyNode } from '../../stores/topology.js'

  let { node }: { node: TopologyNode } = $props()
</script>

<div class="tooltip" role="tooltip">
  <div class="tt-title">
    <span aria-hidden="true">
      {{runner:'⚡','kafka-topic':'📨',consumer:'⚙️',database:'🗄',http:'🌐',webhook:'🪝',rabbitmq:'📨','sns-sqs':'☁️'}[node.type] ?? '●'}
    </span>
    {node.label}
  </div>
  <div class="tt-row"><span class="tt-key">type</span><span class="tt-val">{node.type}</span></div>
  {#if node.durationMs != null}
    <div class="tt-row"><span class="tt-key">duration</span><span class="tt-val" class:warn={node.durationMs > 1000}>{node.durationMs}ms</span></div>
  {/if}
  <div class="tt-row"><span class="tt-key">status</span><span class="tt-val" class:pass={node.status==='pass'} class:fail={node.status==='fail'}>{node.status}</span></div>
  <div class="tt-hint">→ See assertions in panel</div>
</div>

<style>
  .tooltip {
    background: rgba(8,8,20,.96); border: 1px solid var(--border2, #1e1e32);
    border-radius: 10px; padding: 10px 12px; font-size: 9.5px;
    box-shadow: 0 12px 32px rgba(0,0,0,.6); width: 190px;
    animation: tt-in var(--dur-fast, 150ms) var(--ease-spring, cubic-bezier(0.175,0.885,0.32,1.275));
  }
  @keyframes tt-in { from { opacity: 0; transform: scale(0.92) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .tooltip { animation: none; } }

  .tt-title { font-size: 10px; font-weight: 700; color: var(--text-secondary, #94a3b8); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .tt-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .tt-key { color: var(--text-muted, #334155); }
  .tt-val { font-family: var(--font-mono, monospace); color: var(--text-secondary, #94a3b8); }
  .tt-val.pass { color: var(--success, #22c55e); }
  .tt-val.fail { color: var(--error, #ef4444); }
  .tt-val.warn { color: var(--warn, #f59e0b); }
  .tt-hint { font-size: 8.5px; color: var(--accent, #6366f1); margin-top: 6px; cursor: pointer; }
  .tt-hint:hover { text-decoration: underline; }
</style>
