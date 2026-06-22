<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import type { Collection } from '@flowprobe/core'
  import { brokerStatusStore } from '../stores/collection.js'
  import BrokerConfigPanel from './BrokerConfigPanel.svelte'

  /** List of loaded collections to display. */
  export let collections: Collection[] = []

  /** Broker objects to display in a secondary section (optional). */
  export let brokers: { id: string }[] = []

  /** Currently active collection name. */
  export let activeCollectionId: string | null = null

  /** Currently active flow id. */
  export let activeFlowId: string | null = null

  const dispatch = createEventDispatcher<{
    select: { collectionName: string; flowId: string }
  }>()

  // Track which collections are expanded
  let expanded: Record<string, boolean> = {}

  // Which broker config panel is open
  let activeBrokerConfig: string | null = null

  // Ping interval handle
  let pingInterval: ReturnType<typeof setInterval> | null = null

  function toggleCollection(name: string) {
    expanded[name] = !expanded[name]
  }

  function selectFlow(collectionName: string, flowId: string) {
    dispatch('select', { collectionName, flowId })
  }

  function toggleBrokerConfig(brokerId: string) {
    activeBrokerConfig = activeBrokerConfig === brokerId ? null : brokerId
  }

  async function pingBrokers() {
    for (const broker of brokers) {
      const current = $brokerStatusStore.get(broker.id)
      if (!current?.connected) continue
      try {
        const latencyMs = await invoke<number>('ping_broker', { id: broker.id })
        brokerStatusStore.set(broker.id, { ...current, latencyMs })
      } catch {
        // ignore ping failures silently — broker may have disconnected
      }
    }
  }

  onMount(() => {
    pingInterval = setInterval(pingBrokers, 5000)
  })

  onDestroy(() => {
    if (pingInterval !== null) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  })
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
      {#each brokers as broker (broker.id)}
        <li>
          <div
            class="broker-row"
            role="button"
            tabindex="0"
            on:click={() => toggleBrokerConfig(broker.id)}
            on:keydown={e => e.key === 'Enter' && toggleBrokerConfig(broker.id)}
          >
            <span
              class="b-dot"
              class:online={$brokerStatusStore.get(broker.id)?.connected}
              class:connecting={$brokerStatusStore.get(broker.id)?.connecting}
              class:error={!!$brokerStatusStore.get(broker.id)?.error}
            ></span>
            <span class="broker-name">{broker.id}</span>
            {#if $brokerStatusStore.get(broker.id)?.latencyMs != null}
              <span
                class="broker-latency"
                class:warn={($brokerStatusStore.get(broker.id)?.latencyMs ?? 0) > 500}
                class:crit={($brokerStatusStore.get(broker.id)?.latencyMs ?? 0) > 2000}
              >
                {$brokerStatusStore.get(broker.id)?.latencyMs}ms
              </span>
            {/if}
            {#if $brokerStatusStore.get(broker.id)?.error}
              <span class="broker-err-dot" title={$brokerStatusStore.get(broker.id)?.error}>⚠</span>
            {/if}
          </div>
          {#if activeBrokerConfig === broker.id}
            <BrokerConfigPanel brokerId={broker.id} on:close={() => (activeBrokerConfig = null)} />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
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
    cursor: pointer;
    transition: background var(--dur-fast);
    border-radius: var(--radius-sm);
  }

  .broker-row:hover {
    background: var(--bg);
  }

  .broker-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* -- Broker status dot -- */
  .b-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--conn-offline);
    transition: background var(--dur-fast);
  }

  .b-dot.online {
    background: var(--conn-online);
  }

  .b-dot.connecting {
    background: var(--conn-connecting);
    animation: b-pulse var(--dur-slow) ease-in-out infinite;
  }

  .b-dot.error {
    background: var(--conn-error);
  }

  @keyframes b-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.4);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(217, 119, 6, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-dot.connecting {
      animation: none;
    }
  }

  .broker-latency {
    font-size: 9px;
    color: var(--text-muted);
    margin-left: auto;
    font-family: var(--font-mono);
  }

  .broker-latency.warn {
    color: var(--warning);
  }

  .broker-latency.crit {
    color: var(--error);
  }

  .broker-err-dot {
    font-size: 10px;
    color: var(--warning);
    cursor: pointer;
  }
</style>
