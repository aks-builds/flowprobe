<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Collection } from '@flowprobe/core'

  /** List of loaded collections to display. */
  export let collections: Collection[] = []

  /** Broker names to display in a secondary section (optional). */
  export let brokers: string[] = []

  /** Currently active collection name. */
  export let activeCollectionId: string | null = null

  /** Currently active flow id. */
  export let activeFlowId: string | null = null

  const dispatch = createEventDispatcher<{
    select: { collectionName: string; flowId: string }
  }>()

  // Track which collections are expanded
  let expanded: Record<string, boolean> = {}

  function toggleCollection(name: string) {
    expanded[name] = !expanded[name]
  }

  function selectFlow(collectionName: string, flowId: string) {
    dispatch('select', { collectionName, flowId })
  }
</script>

<aside class="sidebar">
  <!-- Collections section -->
  <div class="section-header">
    <span class="section-label">Collections</span>
  </div>

  {#if collections.length === 0}
    <p class="empty-hint">No collections loaded.<br />Open a .yaml file to begin.</p>
  {:else}
    <ul class="collection-list">
      {#each collections as col (col.name)}
        <!-- Collection row -->
        <li class="collection-item">
          <button
            class="collection-row"
            class:active-collection={col.name === activeCollectionId}
            on:click={() => toggleCollection(col.name)}
            aria-expanded={!!expanded[col.name]}
          >
            <span class="chevron" class:open={expanded[col.name]}>›</span>
            <span class="collection-name">{col.name}</span>
            <span class="flow-count">{col.flows.length}</span>
          </button>

          <!-- Flows list (collapsible) -->
          {#if expanded[col.name]}
            <ul class="flow-list">
              {#each col.flows as flow (flow.id)}
                <li>
                  <button
                    class="flow-row"
                    class:active-flow={activeCollectionId === col.name && activeFlowId === flow.id}
                    on:click={() => selectFlow(col.name, flow.id)}
                  >
                    <span class="flow-icon" aria-hidden="true">⇢</span>
                    <span class="flow-name">{flow.name}</span>
                    <span class="step-count">{flow.steps.length}s</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Brokers section (if provided) -->
  {#if brokers.length > 0}
    <div class="section-header section-header--brokers">
      <span class="section-label">Brokers</span>
    </div>
    <ul class="broker-list">
      {#each brokers as broker (broker)}
        <li class="broker-row">
          <span class="broker-dot"></span>
          <span class="broker-name">{broker}</span>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    font-family: var(--font-sans);
  }

  .section-header {
    display: flex;
    align-items: center;
    padding: 10px 12px 6px;
    border-bottom: 1px solid var(--border);
  }

  .section-header--brokers {
    margin-top: var(--space-2);
  }

  .section-label {
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--text-muted);
    padding: var(--space-4) var(--space-3);
    line-height: 1.5;
    margin: 0;
  }

  /* -- Collection list -- */
  .collection-list,
  .flow-list,
  .broker-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .collection-item {
    border-bottom: 1px solid var(--border);
  }

  .collection-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-align: left;
    transition: background var(--dur-fast);
  }

  .collection-row:hover {
    background: var(--bg);
  }

  .collection-row.active-collection {
    color: var(--text-primary);
    font-weight: 600;
  }

  .chevron {
    font-size: var(--text-md);
    line-height: 1;
    transition: transform var(--dur-fast);
    display: inline-block;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .collection-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-count {
    font-size: var(--text-xs);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* -- Flow list -- */
  .flow-list {
    background: var(--bg);
    border-top: 1px solid var(--border);
  }

  .flow-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: 6px 12px 6px 24px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-align: left;
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .flow-row:hover {
    background: var(--accent-light);
    color: var(--accent);
  }

  .flow-row.active-flow {
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 600;
  }

  .flow-icon {
    font-size: var(--text-xs);
    flex-shrink: 0;
  }

  .flow-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-count {
    font-size: var(--text-xs);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* -- Broker list -- */
  .broker-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px 12px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .broker-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }

  .broker-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
