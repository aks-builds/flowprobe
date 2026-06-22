<script lang="ts">
  import { workspaceStore, activeTab } from '../stores/workspace.js'
  import { collectionStore } from '../stores/collection.js'

  function getFlowName(collectionName: string, flowId: string): string {
    const col = $collectionStore.collections.find(c => c.name === collectionName)
    return col?.flows.find(f => f.id === flowId)?.name ?? flowId
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'w' && $activeTab) {
      e.preventDefault()
      workspaceStore.closeTab($activeTab.id)
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $workspaceStore.tabs.length > 0}
  <div class="tab-bar" role="tablist" aria-label="Open flows">
    {#each $workspaceStore.tabs as tab (tab.id)}
      <button
        class="flow-tab"
        class:active={tab.id === $workspaceStore.activeId}
        role="tab"
        aria-selected={tab.id === $workspaceStore.activeId}
        onclick={() => workspaceStore.setActive(tab.id)}
      >
        <span
          class="tab-dot"
          class:dirty={tab.dirty}
          aria-hidden="true"
        ></span>
        <span class="tab-name">{getFlowName(tab.collectionName, tab.flowId)}</span>
        <button
          class="tab-close"
          aria-label="Close tab"
          onclick={(e) => { e.stopPropagation(); workspaceStore.closeTab(tab.id) }}
        >✕</button>
      </button>
    {/each}
  </div>
{/if}

<style>
  .tab-bar {
    height: 33px;
    background: #040408;
    border-bottom: 1px solid var(--border, #161628);
    display: flex;
    align-items: flex-end;
    padding: 0 9px;
    gap: 2px;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .tab-bar::-webkit-scrollbar { display: none; }

  .flow-tab {
    height: 27px;
    padding: 0 10px;
    border-radius: 5px 5px 0 0;
    font-size: 10.5px;
    color: var(--text-muted, #334155);
    background: none;
    border: 1px solid transparent;
    border-bottom: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color var(--dur-fast, 150ms);
  }
  .flow-tab.active {
    background: var(--surface2, #111120);
    color: #c4b5fd;
    border-color: var(--border2, #1e1e32);
  }

  .tab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent, #6366f1);
    flex-shrink: 0;
  }
  .tab-dot.dirty { background: var(--warn, #f59e0b); }

  .tab-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

  .tab-close {
    font-size: 9px;
    color: var(--text-muted, #334155);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    margin-left: 2px;
    border-radius: 3px;
    transition: color var(--dur-fast, 150ms), background var(--dur-fast, 150ms);
  }
  .tab-close:hover { color: var(--text-secondary, #475569); background: rgba(255,255,255,.06); }

  @media (prefers-reduced-motion: reduce) {
    .flow-tab, .tab-close { transition: none; }
  }
</style>
