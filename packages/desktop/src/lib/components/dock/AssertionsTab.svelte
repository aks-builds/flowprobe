<script lang="ts">
  import { runStore } from '../../stores/collection.js'
  import { selectedNodeId } from '../../stores/topology.js'
  import type { Flow, Step } from '@flowprobe/core'

  let { activeFlow }: { activeFlow: Flow | null } = $props()

  let expandedId = $state<string | null>(null)

  // Find which step ID corresponds to the selected topology node
  $: selectedStepId = $selectedNodeId
    ? ($selectedNodeId === 'runner' ? null : $selectedNodeId.replace('node-', ''))
    : null

  type AssertionResult = {
    stepId: string
    stepType: string
    label: string
    passed: boolean
    expected: unknown
    actual: unknown
  }

  $: assertionResults = buildAssertionResults(activeFlow, $runStore.results, selectedStepId)

  function buildAssertionResults(
    flow: Flow | null,
    results: typeof $runStore.results,
    filterStepId: string | null
  ): AssertionResult[] {
    if (!flow || results.length === 0) return []

    const out: AssertionResult[] = []
    for (const result of results) {
      if (filterStepId && result.id !== filterStepId) continue
      const step = flow.steps.find(s => s.id === result.id)
      if (!step) continue

      if (step.type === 'http-assert') {
        for (const a of step.assertions ?? []) {
          out.push({
            stepId: step.id,
            stepType: step.type,
            label: `${a.type}: ${String(a.expected)}`,
            passed: result.passed,
            expected: a.expected,
            actual: result.passed ? a.expected : '(see error)',
          })
        }
      } else {
        out.push({
          stepId: step.id,
          stepType: step.type,
          label: `${step.type} — ${step.id}`,
          passed: result.passed,
          expected: result.passed ? 'pass' : 'pass',
          actual: result.passed ? 'pass' : result.error ?? 'failed',
        })
      }
    }
    return out
  }
</script>

<div class="assertions-tab">
  {#if selectedStepId}
    <div class="sel-note">
      Showing <strong>{selectedStepId}</strong>
      <button class="show-all" onclick={() => selectedNodeId.set(null)}>Show all ›</button>
    </div>
  {/if}

  {#if assertionResults.length === 0}
    <div class="empty">Run the collection to see assertion results</div>
  {:else}
    {#each assertionResults as a (a.stepId + a.label)}
      <div class="arow" class:expanded={expandedId === a.stepId + a.label}>
        <button
          class="arow-top"
          onclick={() => { expandedId = expandedId === a.stepId + a.label ? null : a.stepId + a.label }}
          aria-expanded={expandedId === a.stepId + a.label}
        >
          <div class="a-icon" class:pass={a.passed} class:fail={!a.passed} aria-label={a.passed ? 'passed' : 'failed'}>
            {a.passed ? '✓' : '✕'}
          </div>
          <div class="a-label">{a.label}</div>
          <div class="a-node">{a.stepType}</div>
          <span class="a-chevron" aria-hidden="true">▾</span>
        </button>

        {#if expandedId === a.stepId + a.label}
          <div class="diff-body">
            <div class="diff-row">
              <div class="diff-side exp">
                <div class="diff-label">Expected</div>
                <div class="diff-val">{JSON.stringify(a.expected)}</div>
              </div>
              <div class="diff-gap"></div>
              <div class="diff-side" class:act={!a.passed} class:match={a.passed}>
                <div class="diff-label">Actual</div>
                <div class="diff-val">{JSON.stringify(a.actual)}</div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .assertions-tab { padding: 10px; }
  .sel-note { background: rgba(99,102,241,.08); border: 1px solid rgba(99,102,241,.2); border-radius: 8px; padding: 7px 10px; font-size: 9.5px; color: #a5b4fc; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
  .show-all { margin-left: auto; font-size: 8.5px; color: var(--accent, #6366f1); background: none; border: none; cursor: pointer; }
  .show-all:hover { text-decoration: underline; }
  .empty { font-size: 10px; color: var(--text-muted, #334155); padding: 16px; text-align: center; }
  .arow { background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); border-radius: 8px; margin-bottom: 6px; overflow: hidden; transition: border-color var(--dur-fast, 150ms); }
  .arow:hover { border-color: var(--border3, #252540); }
  .arow.expanded { border-color: rgba(99,102,241,.35); }
  .arow-top { width: 100%; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 10.5px; background: none; border: none; cursor: pointer; text-align: left; }
  .a-icon { width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; flex-shrink: 0; }
  .a-icon.pass { background: rgba(34,197,94,.18); color: #22c55e; }
  .a-icon.fail { background: rgba(239,68,68,.18); color: #ef4444; }
  .a-label { font-family: var(--font-mono, monospace); color: var(--text-secondary, #94a3b8); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .a-node { font-size: 8.5px; color: var(--text-muted, #334155); background: var(--surface, #0c0c18); padding: 1px 5px; border-radius: 4px; flex-shrink: 0; }
  .a-chevron { color: var(--text-muted, #334155); font-size: 10px; flex-shrink: 0; }
  .diff-body { background: #07070f; padding: 8px 10px; font-size: 9px; font-family: var(--font-mono, monospace); }
  .diff-row { display: flex; gap: 4px; }
  .diff-side { flex: 1; padding: 3px 7px; border-radius: 4px; }
  .diff-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted, #334155); margin-bottom: 3px; }
  .diff-side.exp { background: rgba(34,197,94,.07); border-left: 2px solid rgba(34,197,94,.3); }
  .diff-side.exp .diff-val { color: #86efac; }
  .diff-side.act { background: rgba(239,68,68,.07); border-left: 2px solid rgba(239,68,68,.3); }
  .diff-side.act .diff-val { color: #fca5a5; }
  .diff-side.match { background: rgba(99,102,241,.07); border-left: 2px solid rgba(99,102,241,.3); }
  .diff-side.match .diff-val { color: #a5b4fc; }
  .diff-gap { width: 8px; flex-shrink: 0; }
</style>
