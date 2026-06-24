<script lang="ts">
  import { runStore } from '../../stores/collection.js'
  import { selectedNodeId } from '../../stores/topology.js'

  let selectedStepId = $derived($selectedNodeId?.replace('node-', '') ?? null)
  let selectedResult = $derived($runStore.results.find(r => r.id === selectedStepId) ?? $runStore.results[0] ?? null)

  function syntaxHighlight(json: string): string {
    return json
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
        if (/^"/.test(match)) {
          return /:$/.test(match)
            ? `<span class="jk">${match}</span>`
            : `<span class="jv-str">${match}</span>`
        }
        if (/true|false/.test(match)) return `<span class="jv-bool">${match}</span>`
        if (/null/.test(match)) return `<span class="jv-null">${match}</span>`
        return `<span class="jv-num">${match}</span>`
      })
  }

  let payloadJson = $derived(selectedResult
    ? JSON.stringify({ id: selectedResult.id, passed: selectedResult.passed, durationMs: selectedResult.durationMs, error: selectedResult.error, payload: selectedResult.payload ?? null }, null, 2)
    : null)
  let highlighted = $derived(payloadJson ? syntaxHighlight(payloadJson) : '')
</script>

<div class="payload-tab">
  {#if !selectedResult}
    <div class="empty">Run the collection to see payload data</div>
  {:else}
    <div class="payload-label">Step result · {selectedResult.id}</div>
    <div class="json-view" role="region" aria-label="JSON payload">
      {@html highlighted}
    </div>
  {/if}
</div>

<style>
  .payload-tab { padding: 10px; }
  .empty { font-size: 10px; color: var(--text-muted, #334155); padding: 16px; text-align: center; }
  .payload-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted, #334155); margin-bottom: 6px; }
  .json-view { background: var(--bg, #07070f); border: 1px solid var(--border2, #1e1e32); border-radius: 8px; padding: 10px; font-family: var(--font-mono, monospace); font-size: 9px; line-height: 1.7; white-space: pre; overflow-x: auto; }
  :global(.json-view .jk)      { color: #93c5fd; }
  :global(.json-view .jv-str)  { color: #86efac; }
  :global(.json-view .jv-num)  { color: #fcd34d; }
  :global(.json-view .jv-bool) { color: #f9a8d4; }
  :global(.json-view .jv-null) { color: var(--text-muted, #334155); }
</style>
