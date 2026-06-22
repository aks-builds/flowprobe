<script lang="ts">
  import type { Flow } from '@flowprobe/core'
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

  const selectedNode = $derived($topologyStore.nodes.find(n => n.id === $selectedNodeId) ?? null)

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
