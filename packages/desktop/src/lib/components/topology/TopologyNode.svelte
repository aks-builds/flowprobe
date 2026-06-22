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
