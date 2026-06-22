# FlowProbe v2 SP3: Middle Canvas — Event Topology Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FlowCanvas run-mode Vercel timeline with a live animated Event Topology Map — animated node-graph of the system under test with message pulses, bidirectional selection, auto-insight bar, and an event stream drawer.

**Architecture:** A `topologyStore` derives nodes and edges from the active flow definition and `runStore` results. `TopologyCanvas.svelte` renders the graph using absolute-positioned nodes and an SVG edge overlay. A shared `selectedNodeId` writable in `topologyStore` binds the canvas to the right panel (SP4). Message dot animations are pure CSS `@keyframes`. The topology view replaces the FlowCanvas run-mode block; edit mode remains unchanged.

**Tech Stack:** Tauri 2.0, Svelte 5, TypeScript, CSS (no JS animation libraries)

## Global Constraints

- No JS animation libraries (GSAP, Framer, etc.) — CSS `@keyframes` only
- GPU-composited properties only (`transform`, `opacity`) — no `top`/`left` in animations
- Topology node limit for animations: ≤ 12 nodes animate pulse rings; above 12, pulse rings disabled
- No `Co-Authored-By: Claude` in any commit
- SP1 + SP2 must be merged before this plan executes

---

## File Map

```
packages/desktop/src/lib/
├── stores/
│   └── topology.ts                    CREATE — nodes, edges, selectedNodeId, derived from flow+runStore
├── components/
│   ├── topology/
│   │   ├── TopologyCanvas.svelte      CREATE — main canvas, SVG edges, message dots, flow strip, insight bar
│   │   ├── TopologyNode.svelte        CREATE — single node circle, badge, tooltip trigger
│   │   ├── NodeTooltip.svelte         CREATE — floating detail popup for selected node
│   │   └── InsightBar.svelte          CREATE — auto-generated run delta message
│   ├── FlowCanvas.svelte              MODIFY — add topology/sequence/edit toggle; show TopologyCanvas in run mode
│   └── EventStreamDrawer.svelte       MODIFY — add collapsible state, slot into TopologyCanvas bottom
```

---

### Task 1: Topology store

**Files:**
- Create: `packages/desktop/src/lib/stores/topology.ts`
- Create: `packages/desktop/src/lib/stores/topology.test.ts`

**Interfaces:**
- Consumes: `Flow` from `@flowprobe/core` — step definitions become nodes
- Consumes: `runStore` — results annotate nodes with pass/fail/timing
- Produces: `type TopologyNode = { id: string; type: NodeType; label: string; sublabel: string; x: number; y: number; status: 'idle'|'running'|'pass'|'fail'|'pending'; durationMs?: number }`
- Produces: `type TopologyEdge = { id: string; fromId: string; toId: string; label: string; status: 'idle'|'pass'|'fail' }`
- Produces: `type NodeType = 'runner'|'kafka-topic'|'rabbitmq'|'sns-sqs'|'consumer'|'database'|'http'|'webhook'`
- Produces: `topologyStore` — `{ nodes: TopologyNode[]; edges: TopologyEdge[] }`, derived from flow + runStore
- Produces: `selectedNodeId` — writable `string | null`

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/topology.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildTopologyFromFlow } from './topology.js'
import type { Flow } from '@flowprobe/core'

const httpFlow: Flow = {
  id: 'f1', name: 'HTTP Echo',
  steps: [{ id: 's1', type: 'http-assert', method: 'GET', url: 'https://api.example.com/status', assertions: [] }]
}

const kafkaFlow: Flow = {
  id: 'f2', name: 'Kafka Order',
  steps: [
    { id: 'p1', type: 'producer', broker: 'kafka-local', topic: 'orders', payload: {} },
    { id: 'w1', type: 'wait', timeoutMs: 5000, consumer: { broker: 'kafka-local', topic: 'orders', groupId: 'fp-test' } },
  ]
}

describe('buildTopologyFromFlow', () => {
  it('http flow: produces runner node + http node + 1 edge', () => {
    const { nodes, edges } = buildTopologyFromFlow(httpFlow)
    expect(nodes.some(n => n.type === 'runner')).toBe(true)
    expect(nodes.some(n => n.type === 'http')).toBe(true)
    expect(edges).toHaveLength(1)
  })

  it('kafka flow: produces runner + kafka-topic + consumer nodes', () => {
    const { nodes, edges } = buildTopologyFromFlow(kafkaFlow)
    expect(nodes.some(n => n.type === 'kafka-topic')).toBe(true)
    expect(nodes.some(n => n.type === 'consumer')).toBe(true)
    expect(edges.length).toBeGreaterThan(0)
  })

  it('nodes get initial idle status', () => {
    const { nodes } = buildTopologyFromFlow(httpFlow)
    expect(nodes.every(n => n.status === 'idle')).toBe(true)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/topology.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement topology.ts**

Create `packages/desktop/src/lib/stores/topology.ts`:
```typescript
import { writable, derived } from 'svelte/store'
import type { Flow, Step } from '@flowprobe/core'
import { runStore } from './collection.js'

export type NodeType = 'runner' | 'kafka-topic' | 'rabbitmq' | 'sns-sqs' | 'consumer' | 'database' | 'http' | 'webhook'

export type TopologyNode = {
  id: string
  type: NodeType
  label: string
  sublabel: string
  x: number
  y: number
  status: 'idle' | 'running' | 'pass' | 'fail' | 'pending'
  durationMs?: number
  stepId?: string  // which flow step this node represents
}

export type TopologyEdge = {
  id: string
  fromId: string
  toId: string
  label: string
  status: 'idle' | 'pass' | 'fail'
}

export type TopologyGraph = { nodes: TopologyNode[]; edges: TopologyEdge[] }

/** Layout positions for up to 8 nodes in a horizontal cascade with vertical offshoots */
const POSITIONS = [
  { x: 60, y: 140 },   // runner
  { x: 200, y: 140 },  // node 2
  { x: 360, y: 140 },  // node 3
  { x: 520, y: 140 },  // node 4
  { x: 520, y: 280 },  // node 5 (vertical offshoot from node 4)
  { x: 660, y: 200 },  // node 6
  { x: 660, y: 320 },  // node 7
  { x: 660, y: 140 },  // node 8
]

function stepToNodeType(step: Step): NodeType {
  if (step.type === 'producer') {
    const b = step.broker?.toLowerCase() ?? ''
    if (b.includes('rabbit')) return 'rabbitmq'
    if (b.includes('sns') || b.includes('sqs')) return 'sns-sqs'
    return 'kafka-topic'
  }
  if (step.type === 'wait') return 'consumer'
  if (step.type === 'http-assert') return 'http'
  if (step.type === 'db-assert') return 'database'
  if (step.type === 'message-assert') return 'consumer'
  return 'consumer'
}

function stepLabel(step: Step): string {
  if (step.type === 'producer') return step.topic ?? step.broker
  if (step.type === 'wait') return step.consumer?.topic ?? 'consumer'
  if (step.type === 'http-assert') {
    try { return new URL(step.url).hostname } catch { return step.url }
  }
  if (step.type === 'db-assert') return 'database'
  return step.id
}

function stepSublabel(step: Step): string {
  if (step.type === 'producer') return `Kafka · topic`
  if (step.type === 'wait') return `consumer · ${step.consumer?.groupId ?? ''}`
  if (step.type === 'http-assert') return `${step.method} endpoint`
  if (step.type === 'db-assert') return `SQL assertion`
  return step.type
}

export function buildTopologyFromFlow(flow: Flow): TopologyGraph {
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []

  // Always start with runner node
  nodes.push({
    id: 'runner',
    type: 'runner',
    label: 'FlowProbe',
    sublabel: 'test runner',
    ...POSITIONS[0],
    status: 'idle',
  })

  flow.steps.forEach((step, i) => {
    const pos = POSITIONS[i + 1] ?? { x: 60 + (i + 1) * 150, y: 140 }
    nodes.push({
      id: `node-${step.id}`,
      type: stepToNodeType(step),
      label: stepLabel(step),
      sublabel: stepSublabel(step),
      ...pos,
      status: 'idle',
      stepId: step.id,
    })

    const fromId = i === 0 ? 'runner' : `node-${flow.steps[i - 1].id}`
    edges.push({
      id: `edge-${fromId}-node-${step.id}`,
      fromId,
      toId: `node-${step.id}`,
      label: step.type === 'producer' ? 'PUBLISH' : step.type === 'wait' ? 'consume' : '',
      status: 'idle',
    })
  })

  return { nodes, edges }
}

// ── Shared selected node ──
export const selectedNodeId = writable<string | null>(null)

// ── Active topology store (set by +page.svelte when flow changes) ──
export const topologyStore = writable<TopologyGraph>({ nodes: [], edges: [] })

/** Apply runStore results to topology nodes/edges */
export function applyRunResults(
  graph: TopologyGraph,
  results: Array<{ id: string; passed: boolean; durationMs: number }>,
  runState: string
): TopologyGraph {
  const resultMap = new Map(results.map(r => [r.id, r]))
  const nodes = graph.nodes.map(n => {
    if (!n.stepId) return { ...n, status: runState === 'running' ? 'running' as const : n.status }
    const r = resultMap.get(n.stepId)
    if (!r) return { ...n, status: runState === 'running' ? 'running' as const : 'pending' as const }
    return { ...n, status: r.passed ? 'pass' as const : 'fail' as const, durationMs: r.durationMs }
  })
  const edges = graph.edges.map(e => {
    const toNode = nodes.find(n => n.id === e.toId)
    if (!toNode) return e
    return { ...e, status: toNode.status === 'pass' ? 'pass' as const : toNode.status === 'fail' ? 'fail' as const : 'idle' as const }
  })
  return { nodes, edges }
}
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/topology.test.ts 2>&1 | tail -5
```
Expected: `3 passed`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/stores/topology.ts packages/desktop/src/lib/stores/topology.test.ts
git commit -m "feat(desktop): topologyStore — build node graph from flow, apply run results"
```

---

### Task 2: TopologyNode component

**Files:**
- Create: `packages/desktop/src/lib/components/topology/TopologyNode.svelte`

**Interfaces:**
- Consumes: `TopologyNode` type from `../stores/topology.js`
- Consumes: `selectedNodeId` store from `../stores/topology.js`
- Produces: `<TopologyNode node={TopologyNode} />` — absolutely positioned circle node, click sets selectedNodeId

- [ ] **Step 1: Create TopologyNode.svelte**

Create `packages/desktop/src/lib/components/topology/TopologyNode.svelte`:

```svelte
<script lang="ts">
  import { selectedNodeId, type TopologyNode } from '../../stores/topology.js'

  let { node }: { node: TopologyNode } = $props()

  const NODE_SIZES: Record<string, number> = {
    runner: 60, 'kafka-topic': 52, consumer: 56, database: 48, http: 50, webhook: 50, rabbitmq: 52, 'sns-sqs': 52,
  }
  const ICONS: Record<string, string> = {
    runner: '⚡', 'kafka-topic': '📨', consumer: '⚙️', database: '🗄', http: '🌐', webhook: '🪝', rabbitmq: '📨', 'sns-sqs': '☁️',
  }
  const COLORS: Record<string, string> = {
    runner: '#6366f1', 'kafka-topic': '#8b5cf6', consumer: '#06b6d4', database: '#22c55e',
    http: '#f59e0b', webhook: '#f59e0b', rabbitmq: '#a855f7', 'sns-sqs': '#f59e0b',
  }

  $: size = NODE_SIZES[node.type] ?? 50
  $: icon = ICONS[node.type] ?? '●'
  $: color = COLORS[node.type] ?? '#6366f1'
  $: isSelected = $selectedNodeId === node.id
  $: glow = node.status === 'fail'
    ? `0 0 0 6px rgba(239,68,68,.12), 0 0 20px rgba(239,68,68,.3)`
    : isSelected
    ? `0 0 0 6px rgba(6,182,212,.12), 0 0 22px rgba(6,182,212,.3)`
    : node.status === 'running'
    ? `0 0 18px ${color}44`
    : 'none'
  $: borderColor = node.status === 'fail' ? '#ef4444' : node.status === 'pass' ? color : color
  $: borderOpacity = node.status === 'pending' ? 0.25 : isSelected ? 1 : 0.55
</script>

<div
  class="node-wrap"
  style:left="{node.x - size / 2}px"
  style:top="{node.y - size / 2}px"
  style:width="{size}px"
  role="button"
  tabindex="0"
  aria-label="{node.label} — {node.sublabel}"
  aria-pressed={isSelected}
  onclick={() => selectedNodeId.set(isSelected ? null : node.id)}
  onkeydown={e => (e.key === 'Enter' || e.key === ' ') && selectedNodeId.set(isSelected ? null : node.id)}
>
  <!-- Pulse ring (running state) -->
  {#if node.status === 'running'}
    <div class="pulse-ring" style:border-color={color} aria-hidden="true"></div>
  {/if}

  <!-- Node circle -->
  <div
    class="node-circle"
    class:pass={node.status === 'pass'}
    class:fail={node.status === 'fail'}
    class:running={node.status === 'running'}
    class:selected={isSelected}
    style:width="{size}px"
    style:height="{size}px"
    style:border-color="{borderColor}"
    style:border-opacity="{borderOpacity}"
    style:box-shadow={glow}
    style:background="rgba({color.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',') ?? '99,102,241'}, 0.12)"
  >
    <span class="node-icon" aria-hidden="true">{icon}</span>

    <!-- Status badge -->
    {#if node.status === 'pass'}
      <div class="node-badge pass" aria-label="passed">✓</div>
    {:else if node.status === 'fail'}
      <div class="node-badge fail" aria-label="failed">✕</div>
    {/if}
  </div>

  <!-- Labels -->
  <div class="node-label" style:color={node.status === 'fail' ? '#f87171' : isSelected ? '#22d3ee' : color}>
    {node.label}
  </div>
  <div class="node-sublabel">
    {node.durationMs != null ? `${node.durationMs}ms` : node.sublabel}
  </div>
</div>

<style>
  .node-wrap {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    z-index: 5;
  }

  .pulse-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid;
    animation: pr 1.8s ease-out infinite;
    pointer-events: none;
  }
  @keyframes pr {
    0%   { opacity: .6; transform: scale(1); }
    100% { opacity: 0;  transform: scale(1.9); }
  }
  @media (prefers-reduced-motion: reduce) { .pulse-ring { animation: none; } }

  .node-circle {
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: box-shadow var(--dur-fast, 150ms), transform var(--dur-fast, 150ms);
    flex-shrink: 0;
  }
  .node-circle:hover, .node-circle.selected { transform: scale(1.06); }
  .node-circle.pass { border-color: #22c55e; }
  .node-circle.fail { border-color: #ef4444; background: rgba(239,68,68,.12) !important; }
  @media (prefers-reduced-motion: reduce) { .node-circle { transition: none; } }

  .node-icon { font-size: 22px; }

  .node-badge {
    position: absolute;
    top: -5px; right: -5px;
    width: 16px; height: 16px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; font-weight: 800;
    border: 2px solid var(--bg, #07070f);
    animation: badge-pop var(--dur-fast, 150ms) var(--ease-spring, cubic-bezier(0.175,0.885,0.32,1.275));
  }
  @keyframes badge-pop { from { transform: scale(0); } to { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .node-badge { animation: none; } }

  .node-badge.pass { background: rgba(34,197,94,.2); color: #22c55e; }
  .node-badge.fail { background: rgba(239,68,68,.2); color: #ef4444; }

  .node-label {
    font-size: 9.5px;
    font-weight: 700;
    text-align: center;
    max-width: 80px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .node-sublabel {
    font-size: 8px;
    color: var(--text-muted, #334155);
    font-family: var(--font-mono, monospace);
    text-align: center;
  }
</style>
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/topology/TopologyNode.svelte
git commit -m "feat(desktop): TopologyNode — animated node circle with status badges"
```

---

### Task 3: InsightBar + NodeTooltip components

**Files:**
- Create: `packages/desktop/src/lib/components/topology/InsightBar.svelte`
- Create: `packages/desktop/src/lib/components/topology/NodeTooltip.svelte`

**Interfaces:**
- `InsightBar` consumes: `runStore` — derives the insight message by comparing last 2 runs
- `InsightBar` produces: `<InsightBar />` — one-line strip, auto-dismisses 8s after run done, emits `compareRuns` event
- `NodeTooltip` consumes: `node: TopologyNode` prop
- `NodeTooltip` produces: `<NodeTooltip {node} />` — floating card, appears when node is selected

- [ ] **Step 1: Create InsightBar.svelte**

Create `packages/desktop/src/lib/components/topology/InsightBar.svelte`:

```svelte
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
```

- [ ] **Step 2: Create NodeTooltip.svelte**

Create `packages/desktop/src/lib/components/topology/NodeTooltip.svelte`:

```svelte
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
```

- [ ] **Step 3: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/topology/
git commit -m "feat(desktop): InsightBar + NodeTooltip for topology canvas"
```

---

### Task 4: TopologyCanvas — main component

**Files:**
- Create: `packages/desktop/src/lib/components/topology/TopologyCanvas.svelte`

**Interfaces:**
- Consumes: `topologyStore`, `selectedNodeId`, `applyRunResults` from `../../stores/topology.js`
- Consumes: `runStore` from `../../stores/collection.js`
- Consumes: `TopologyNode`, `InsightBar`, `NodeTooltip` components
- Consumes: `EventStreamDrawer` from `../EventStreamDrawer.svelte`
- Produces: `<TopologyCanvas flow={Flow} logs={LogEntry[]} />` — full canvas

- [ ] **Step 1: Create TopologyCanvas.svelte**

Create `packages/desktop/src/lib/components/topology/TopologyCanvas.svelte`:

```svelte
<script lang="ts">
  import type { Flow } from '@flowprobe/core'
  import { onMount } from 'svelte'
  import {
    topologyStore, selectedNodeId,
    buildTopologyFromFlow, applyRunResults,
    type TopologyNode, type TopologyEdge
  } from '../../stores/topology.js'
  import { runStore } from '../../stores/collection.js'
  import TopologyNodeComp from './TopologyNode.svelte'
  import NodeTooltip from './NodeTooltip.svelte'
  import InsightBar from './InsightBar.svelte'
  import EventStreamDrawer from '../EventStreamDrawer.svelte'
  import type { LogEntry } from '../EventStreamDrawer.svelte'

  let { flow, logs = [] }: { flow: Flow; logs?: LogEntry[] } = $props()

  let drawerOpen = $state(true)

  // Build topology when flow changes
  $effect(() => {
    topologyStore.set(buildTopologyFromFlow(flow))
  })

  // Apply run results when runStore updates
  $effect(() => {
    const current = $topologyStore
    const results = $runStore.results
    const state = $runStore.state
    if (results.length > 0 || state === 'running') {
      topologyStore.set(applyRunResults(current, results, state))
    }
  })

  $: selectedNode = $topologyStore.nodes.find(n => n.id === $selectedNodeId) ?? null

  // Dismiss tooltip on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') selectedNodeId.set(null)
  }

  // SVG line position helpers
  function edgeLine(edge: TopologyEdge, nodes: TopologyNode[]) {
    const from = nodes.find(n => n.id === edge.fromId)
    const to = nodes.find(n => n.id === edge.toId)
    if (!from || !to) return null
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="topo-canvas">
  <!-- Dot grid background via CSS -->

  <!-- Flow name strip -->
  <div class="flow-strip">
    <span class="flow-name">{flow.name}</span>
    {#if $runStore.state === 'pass' || ($runStore.state === 'done' && $runStore.results.every(r => r.passed))}
      <span class="flow-badge pass">PASSED</span>
    {:else if $runStore.state === 'done' && $runStore.results.some(r => !r.passed)}
      <span class="flow-badge fail">FAILED</span>
    {:else if $runStore.state === 'running'}
      <span class="flow-badge running">RUNNING</span>
    {/if}
    {#if $runStore.results.length > 0}
      <span class="flow-dur">{$runStore.results.reduce((s,r) => s + r.durationMs, 0)}ms</span>
    {/if}
    <span class="flow-hint">Click any node to inspect</span>
  </div>

  <!-- SVG edges -->
  <svg class="edges-svg" aria-hidden="true">
    <defs>
      <marker id="topo-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="rgba(99,102,241,.4)" />
      </marker>
    </defs>
    {#each $topologyStore.edges as edge (edge.id)}
      {@const line = edgeLine(edge, $topologyStore.nodes)}
      {#if line}
        <line
          x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
          stroke={edge.status === 'fail' ? 'rgba(239,68,68,.5)' : edge.status === 'pass' ? 'rgba(99,102,241,.45)' : 'rgba(99,102,241,.25)'}
          stroke-width="1.5"
          stroke-dasharray={edge.status === 'fail' ? '5 4' : 'none'}
          marker-end="url(#topo-arrow)"
        />
        {#if edge.label}
          <text
            x={(line.x1 + line.x2) / 2}
            y={(line.y1 + line.y2) / 2 - 6}
            font-size="8"
            fill="rgba(99,102,241,.7)"
            font-family="monospace"
            text-anchor="middle"
          >{edge.label}</text>
        {/if}
      {/if}
    {/each}
  </svg>

  <!-- Nodes -->
  {#each $topologyStore.nodes as node (node.id)}
    <TopologyNodeComp {node} />
  {/each}

  <!-- Selected node tooltip -->
  {#if selectedNode}
    <div
      class="tooltip-anchor"
      style:left="{selectedNode.x + 36}px"
      style:top="{selectedNode.y + 36}px"
    >
      <NodeTooltip node={selectedNode} />
    </div>
  {/if}

  <!-- Bottom section: event stream + insight bar -->
  <div class="canvas-bottom">
    <InsightBar />
    <EventStreamDrawer entries={logs} open={drawerOpen} liveCount={$runStore.state === 'running' ? 1 : 0}
      on:toggle={() => { drawerOpen = !drawerOpen }} />
  </div>
</div>

<style>
  .topo-canvas {
    flex: 1;
    background: #05050c;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-image:
      radial-gradient(circle at 30% 40%, rgba(99,102,241,.04) 0%, transparent 55%),
      radial-gradient(circle at 70% 60%, rgba(6,182,212,.03) 0%, transparent 55%);
  }
  .topo-canvas::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px);
    background-size: 26px 26px;
    pointer-events: none;
  }

  .flow-strip {
    position: absolute; top: 0; left: 0; right: 0; height: 34px; z-index: 10;
    background: rgba(5,5,12,.9); border-bottom: 1px solid var(--border, #161628);
    display: flex; align-items: center; padding: 0 14px; gap: 10px;
    backdrop-filter: blur(8px);
  }
  .flow-name { font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); }
  .flow-badge {
    font-size: 8.5px; font-weight: 700; padding: 2px 8px; border-radius: 5px;
  }
  .flow-badge.pass { background: rgba(34,197,94,.14); color: #22c55e; }
  .flow-badge.fail { background: rgba(239,68,68,.14); color: #ef4444; }
  .flow-badge.running { background: rgba(59,130,246,.15); color: #60a5fa; }
  .flow-dur { font-size: 9.5px; font-family: var(--font-mono); color: var(--text-muted, #334155); margin-left: auto; }
  .flow-hint { font-size: 9px; color: var(--text-muted, #334155); font-style: italic; }

  .edges-svg {
    position: absolute; inset: 34px 0 0 0;
    pointer-events: none; z-index: 2; width: 100%; height: 100%;
    overflow: visible;
  }

  .tooltip-anchor { position: absolute; z-index: 20; }

  .canvas-bottom {
    position: absolute; bottom: 0; left: 0; right: 0;
    display: flex; flex-direction: column;
  }
</style>
```

- [ ] **Step 2: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/topology/TopologyCanvas.svelte
git commit -m "feat(desktop): TopologyCanvas — live animated node-graph for run mode"
```

---

### Task 5: Wire TopologyCanvas into FlowCanvas + add view toggle

**Files:**
- Modify: `packages/desktop/src/lib/components/FlowCanvas.svelte`

**Interfaces:**
- Consumes: `TopologyCanvas` from `./topology/TopologyCanvas.svelte`
- FlowCanvas now accepts a `logs` prop (already exists from v1 fix) and passes it to TopologyCanvas
- Adds a view toggle: `'edit' | 'topology' | 'sequence'` — sequence is a stub for SP5

- [ ] **Step 1: Read current FlowCanvas.svelte**

Read the full file before making changes.

- [ ] **Step 2: Add view toggle and TopologyCanvas**

In `FlowCanvas.svelte` script block, add:
```typescript
import TopologyCanvas from './topology/TopologyCanvas.svelte'
let canvasView = $state<'edit' | 'topology'>('edit')

// Auto-switch to topology when run starts; back to edit on reset
$effect(() => {
  if ($runStore.state === 'running' || $runStore.state === 'done') {
    canvasView = 'topology'
  }
  if ($runStore.state === 'idle') {
    canvasView = 'edit'
  }
})
```

In the template, replace the `{#if !isRunMode}...{:else}...{/if}` block with:

```svelte
<!-- View toggle (only visible when run has happened) -->
{#if $runStore.state !== 'idle'}
  <div class="view-toggle">
    <button class:active={canvasView === 'topology'} onclick={() => canvasView = 'topology'}>Topology</button>
    <button class:active={canvasView === 'edit'} onclick={() => canvasView = 'edit'}>Edit</button>
  </div>
{/if}

{#if canvasView === 'topology' && $runStore.state !== 'idle'}
  <TopologyCanvas {flow} {logs} />
{:else}
  <!-- existing edit mode pipeline content here — unchanged -->
{/if}
```

Add `.view-toggle` CSS:
```css
.view-toggle {
  position: absolute; top: 40px; right: 14px; z-index: 15;
  display: flex; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32);
  border-radius: 8px; overflow: hidden;
}
.view-toggle button {
  padding: 4px 12px; font-size: 9.5px; background: none; border: none; cursor: pointer;
  color: var(--text-muted, #334155); transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
}
.view-toggle button.active { background: rgba(99,102,241,.15); color: #a5b4fc; font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .view-toggle button { transition: none; } }
```

- [ ] **Step 3: Full integration test**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
cd packages/desktop && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10
```
Expected: 0 errors

- [ ] **Step 4: Run test suite**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/components/FlowCanvas.svelte
git commit -m "feat(desktop): wire TopologyCanvas into FlowCanvas with edit/topology toggle"
```
