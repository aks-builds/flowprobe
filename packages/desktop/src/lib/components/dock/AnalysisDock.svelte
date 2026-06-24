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

  let hasNewAssertions = $derived($runStore.results.some(r => !r.passed))
  let hasDiff = $derived($runStore.results.length > 0)
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
