# FlowProbe v2 SP4: Right Panel — Analysis Dock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single ResultPanel with a 5-tab Analysis Dock (Results / Assertions / Diff / Payload / History). The Assertions tab shows per-assertion inline diffs scoped to the topology's selected node. The Diff tab shows Expected vs Actual event sequence. The Payload tab shows raw JSON with syntax highlighting.

**Architecture:** `AnalysisDock.svelte` wraps 5 tab-panel components. A shared `dockTabStore` writable controls which tab is active. The topology's `selectedNodeId` store (SP3) auto-switches the Assertions tab to show that node's assertions. The Diff tab reads from a `diffStore` that compares the last two completed runs.

**Tech Stack:** Tauri 2.0, Svelte 5, TypeScript

## Global Constraints

- Svelte 5 runes in all new components
- No `Co-Authored-By: Claude` in any commit
- SP3 (Topology Canvas) must be merged before this plan — `selectedNodeId` from `topology.ts` is a required dependency
- `selectedNodeId` from `packages/desktop/src/lib/stores/topology.ts`

---

## File Map

```
packages/desktop/src/lib/
├── stores/
│   └── dock.ts                       CREATE — active tab, diffStore (run comparison)
├── components/
│   ├── dock/
│   │   ├── AnalysisDock.svelte       CREATE — tab container, 300px right panel
│   │   ├── ResultsTab.svelte         CREATE — refactored from existing ResultPanel
│   │   ├── AssertionsTab.svelte      CREATE — per-assertion list + inline diff
│   │   ├── DiffTab.svelte            CREATE — expected vs actual event comparison
│   │   ├── PayloadTab.svelte         CREATE — JSON viewer
│   │   └── HistoryTab.svelte         CREATE — run list (stub, wired fully in SP5)
│   └── ResultPanel.svelte            REPLACE with <AnalysisDock> in +page.svelte
```

---

### Task 1: Dock store

**Files:**
- Create: `packages/desktop/src/lib/stores/dock.ts`
- Create: `packages/desktop/src/lib/stores/dock.test.ts`

**Interfaces:**
- Produces: `type DockTab = 'results' | 'assertions' | 'diff' | 'payload' | 'history'`
- Produces: `dockTabStore` — writable `DockTab`, default `'results'`
- Produces: `type RunSnapshot = { results: StepRunResult[]; state: string; timestamp: number }`
- Produces: `diffStore` — `{ current: RunSnapshot | null; previous: RunSnapshot | null }`, `diffStore.recordRun(snapshot)` keeps last 2

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/dock.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { dockTabStore, diffStore, type DockTab } from './dock.js'

describe('dockTabStore', () => {
  it('defaults to results', () => { expect(get(dockTabStore)).toBe('results') })
  it('switches tab', () => {
    dockTabStore.set('assertions')
    expect(get(dockTabStore)).toBe('assertions')
    dockTabStore.set('results')
  })
})

describe('diffStore', () => {
  it('starts empty', () => {
    const s = get(diffStore)
    expect(s.current).toBeNull()
    expect(s.previous).toBeNull()
  })
  it('records first run as current', () => {
    diffStore.recordRun({ results: [], state: 'done', timestamp: 1 })
    expect(get(diffStore).current?.timestamp).toBe(1)
    expect(get(diffStore).previous).toBeNull()
  })
  it('second run pushes first to previous', () => {
    diffStore.recordRun({ results: [], state: 'done', timestamp: 2 })
    expect(get(diffStore).current?.timestamp).toBe(2)
    expect(get(diffStore).previous?.timestamp).toBe(1)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/dock.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement dock.ts**

Create `packages/desktop/src/lib/stores/dock.ts`:
```typescript
import { writable } from 'svelte/store'
import type { StepRunResult } from '@flowprobe/core'

export type DockTab = 'results' | 'assertions' | 'diff' | 'payload' | 'history'

export const dockTabStore = writable<DockTab>('results')

export type RunSnapshot = {
  results: StepRunResult[]
  state: string
  timestamp: number
}

function createDiffStore() {
  const { subscribe, update } = writable<{ current: RunSnapshot | null; previous: RunSnapshot | null }>({
    current: null, previous: null,
  })
  return {
    subscribe,
    recordRun(snapshot: RunSnapshot) {
      update(s => ({ previous: s.current, current: snapshot }))
    },
  }
}

export const diffStore = createDiffStore()
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/dock.test.ts 2>&1 | tail -5
```
Expected: `5 passed`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/stores/dock.ts packages/desktop/src/lib/stores/dock.test.ts
git commit -m "feat(desktop): dockTabStore + diffStore for analysis dock"
```

---

### Task 2: ResultsTab (refactor existing ResultPanel content)

**Files:**
- Create: `packages/desktop/src/lib/components/dock/ResultsTab.svelte`

**Interfaces:**
- Consumes: `runStore` from `../../stores/collection.js`
- Produces: `<ResultsTab />` — spark-lines, run counter, step summary cards (all content currently in `ResultPanel.svelte`)

- [ ] **Step 1: Create ResultsTab.svelte**

Create `packages/desktop/src/lib/components/dock/ResultsTab.svelte`.

Read `packages/desktop/src/lib/components/ResultPanel.svelte` first to identify the Results tab content. Extract all HTML, script, and styles related to the Results tab (spark-lines, run counter, step result cards) into this new file. The interface is identical — it reads directly from `runStore`.

The component must:
- Show a `PASSED`/`FAILED` summary badge + total duration
- Show spark-line chart (timing history per step, last 6 runs)
- Show run counter `#N`
- Show compact step cards (pass/fail icon, step name, type, duration)

Copy the spark-line logic and CSS from `ResultPanel.svelte` verbatim.

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/dock/ResultsTab.svelte
git commit -m "feat(desktop): ResultsTab — extracted from ResultPanel"
```

---

### Task 3: AssertionsTab with inline diff

**Files:**
- Create: `packages/desktop/src/lib/components/dock/AssertionsTab.svelte`

**Interfaces:**
- Consumes: `runStore` from `../../stores/collection.js`
- Consumes: `selectedNodeId` from `../../stores/topology.js`
- Consumes: `collectionStore` from `../../stores/collection.js` — to get `Assertion[]` from the active flow step
- Produces: `<AssertionsTab activeFlow={Flow | null} />` — assertion list scoped to selected node, inline diff on expand

- [ ] **Step 1: Create AssertionsTab.svelte**

Create `packages/desktop/src/lib/components/dock/AssertionsTab.svelte`:

```svelte
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
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/dock/AssertionsTab.svelte
git commit -m "feat(desktop): AssertionsTab — inline diff, scoped to selected topology node"
```

---

### Task 4: DiffTab (Expected vs Actual), PayloadTab, HistoryTab

**Files:**
- Create: `packages/desktop/src/lib/components/dock/DiffTab.svelte`
- Create: `packages/desktop/src/lib/components/dock/PayloadTab.svelte`
- Create: `packages/desktop/src/lib/components/dock/HistoryTab.svelte`

- [ ] **Step 1: Create DiffTab.svelte**

Create `packages/desktop/src/lib/components/dock/DiffTab.svelte`:

```svelte
<script lang="ts">
  import { runStore } from '../../stores/collection.js'
  import { diffStore } from '../../stores/dock.js'
  import type { Flow } from '@flowprobe/core'

  let { activeFlow }: { activeFlow: Flow | null } = $props()

  let mode = $state<'expected-actual' | 'compare-runs'>('expected-actual')

  $: currentResults = $runStore.results
  $: previousResults = $diffStore.previous?.results ?? []

  function statusClass(passed: boolean) { return passed ? 'pass' : 'fail' }
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
```

- [ ] **Step 2: Create PayloadTab.svelte**

Create `packages/desktop/src/lib/components/dock/PayloadTab.svelte`:

```svelte
<script lang="ts">
  import { runStore } from '../../stores/collection.js'
  import { selectedNodeId } from '../../stores/topology.js'

  $: selectedStepId = $selectedNodeId?.replace('node-', '') ?? null
  $: selectedResult = $runStore.results.find(r => r.id === selectedStepId) ?? $runStore.results[0] ?? null

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

  $: payloadJson = selectedResult
    ? JSON.stringify({ id: selectedResult.id, passed: selectedResult.passed, durationMs: selectedResult.durationMs, error: selectedResult.error }, null, 2)
    : null
  $: highlighted = payloadJson ? syntaxHighlight(payloadJson) : ''
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
```

- [ ] **Step 3: Create HistoryTab.svelte (stub for SP5)**

Create `packages/desktop/src/lib/components/dock/HistoryTab.svelte`:
```svelte
<!-- Full implementation in SP5 (history persistence) -->
<div style="padding:14px;font-size:11px;color:var(--text-muted)">
  Run history will appear here after SP5 is implemented.
</div>
```

- [ ] **Step 4: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/dock/
git commit -m "feat(desktop): DiffTab, PayloadTab, HistoryTab (stub) for analysis dock"
```

---

### Task 5: AnalysisDock container + wire into +page.svelte

**Files:**
- Create: `packages/desktop/src/lib/components/dock/AnalysisDock.svelte`
- Modify: `packages/desktop/src/routes/+page.svelte`

- [ ] **Step 1: Create AnalysisDock.svelte**

Create `packages/desktop/src/lib/components/dock/AnalysisDock.svelte`:

```svelte
<script lang="ts">
  import { dockTabStore, diffStore, type DockTab } from '../../stores/dock.js'
  import { runStore } from '../../stores/collection.js'
  import { selectedNodeId } from '../../stores/topology.js'
  import ResultsTab from './ResultsTab.svelte'
  import AssertionsTab from './AssertionsTab.svelte'
  import DiffTab from './DiffTab.svelte'
  import PayloadTab from './PayloadTab.svelte'
  import HistoryTab from './HistoryTab.svelte'
  import type { Flow } from '@flowprobe/core'

  let { activeFlow }: { activeFlow: Flow | null } = $props()

  const TABS: { id: DockTab; label: string }[] = [
    { id: 'results',    label: 'Results'    },
    { id: 'assertions', label: 'Assertions' },
    { id: 'diff',       label: 'Diff'       },
    { id: 'payload',    label: 'Payload'    },
    { id: 'history',    label: 'History'    },
  ]

  // When a node is selected in topology, switch to assertions tab
  $effect(() => {
    if ($selectedNodeId && $selectedNodeId !== 'runner') {
      dockTabStore.set('assertions')
    }
  })

  // Record run snapshot for diffing
  $effect(() => {
    if ($runStore.state === 'done' && $runStore.results.length > 0) {
      diffStore.recordRun({ results: [...$runStore.results], state: $runStore.state, timestamp: Date.now() })
    }
  })

  $: hasNewAssertions = $runStore.results.some(r => !r.passed)
  $: hasDiff = $runStore.results.length > 0
</script>

<aside class="analysis-dock" aria-label="Analysis dock">
  <!-- Tab strip -->
  <div class="dock-tabs" role="tablist">
    {#each TABS as tab (tab.id)}
      <button
        class="dock-tab"
        class:active={$dockTabStore === tab.id}
        role="tab"
        aria-selected={$dockTabStore === tab.id}
        onclick={() => dockTabStore.set(tab.id)}
      >
        {tab.label}
        {#if tab.id === 'assertions' && hasNewAssertions}
          <span class="new-dot" aria-label="has failures"></span>
        {:else if tab.id === 'diff' && hasDiff}
          <span class="new-dot cyan" aria-label="diff available"></span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <div class="dock-body">
    {#if $dockTabStore === 'results'}
      <ResultsTab />
    {:else if $dockTabStore === 'assertions'}
      <AssertionsTab {activeFlow} />
    {:else if $dockTabStore === 'diff'}
      <DiffTab {activeFlow} />
    {:else if $dockTabStore === 'payload'}
      <PayloadTab />
    {:else if $dockTabStore === 'history'}
      <HistoryTab />
    {/if}
  </div>
</aside>

<style>
  .analysis-dock {
    width: 300px;
    border-left: 1px solid var(--border, #161628);
    background: #05050d;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .dock-tabs {
    display: flex;
    border-bottom: 1px solid var(--border, #161628);
    flex-shrink: 0;
    overflow-x: auto;
  }
  .dock-tabs::-webkit-scrollbar { display: none; }

  .dock-tab {
    padding: 0 11px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--text-muted, #334155);
    cursor: pointer;
    background: none;
    border: none;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: color var(--dur-fast, 150ms);
  }
  .dock-tab.active {
    color: #a5b4fc;
    border-bottom-color: var(--accent, #6366f1);
  }
  .dock-tab:hover:not(.active) { color: var(--text-secondary, #475569); }

  .new-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--error, #ef4444); flex-shrink: 0;
  }
  .new-dot.cyan { background: var(--cyan, #06b6d4); }

  .dock-body {
    flex: 1;
    overflow-y: auto;
  }
  .dock-body::-webkit-scrollbar { width: 3px; }
  .dock-body::-webkit-scrollbar-thumb { background: var(--border2, #1e1e32); border-radius: 2px; }

  @media (prefers-reduced-motion: reduce) {
    .dock-tab { transition: none; }
  }
</style>
```

- [ ] **Step 2: Replace ResultPanel with AnalysisDock in +page.svelte**

Read `packages/desktop/src/routes/+page.svelte`. Find the `<ResultPanel .../>` usage. Replace it with:
```svelte
import AnalysisDock from '$lib/components/dock/AnalysisDock.svelte'
```
And:
```svelte
<AnalysisDock activeFlow={activeFlow ?? null} />
```

Remove the `ResultPanel` import.

- [ ] **Step 3: Full integration check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
cd packages/desktop && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
```
Expected: 0 svelte-check errors, all tests pass

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src/lib/components/dock/ packages/desktop/src/routes/+page.svelte
git commit -m "feat(desktop): AnalysisDock — 5-tab analysis panel replaces ResultPanel"
```
