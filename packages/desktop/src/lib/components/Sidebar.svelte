<script lang="ts">
  import type { Collection } from '@flowprobe/core'
  import { navStore } from '../stores/nav.js'
  import CollectionsPanel from './sidebar/CollectionsPanel.svelte'
  import EnvironmentsPanel from './sidebar/EnvironmentsPanel.svelte'
  import HistoryPanel from './sidebar/HistoryPanel.svelte'
  import SettingsPanel from './sidebar/SettingsPanel.svelte'

  /** List of loaded collections to display. */
  export let collections: Collection[] = []

  /** Broker objects to display in a secondary section (optional). */
  export let brokers: { id: string }[] = []

  /** Currently active collection name. */
  export let activeCollectionId: string | null = null

  /** Currently active flow id. */
  export let activeFlowId: string | null = null

</script>

<aside class="sidebar">
  {#if $navStore === 'collections'}
    <CollectionsPanel
      {collections}
      {brokers}
      {activeCollectionId}
      {activeFlowId}
      on:select
    />
  {:else if $navStore === 'environments'}
    <EnvironmentsPanel />
  {:else if $navStore === 'history'}
    <HistoryPanel />
  {:else if $navStore === 'settings'}
    <SettingsPanel />
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
</style>
