<!-- packages/desktop/src/routes/+page.svelte -->
<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte'
  import FlowCanvas from '$lib/components/FlowCanvas.svelte'
  import ResultPanel from '$lib/components/ResultPanel.svelte'
  import CommandPalette from '$lib/components/CommandPalette.svelte'
  import { collectionStore } from '$lib/stores/collection.js'
  import type { FlowRunResult } from '@flowprobe/core'

  let paletteOpen = false
  let selectedStepId: string | null = null
  let activeFlowResult: FlowRunResult | null = null

  $: collections = $collectionStore.collections
  $: activeCollection = collections.find(c => c.name === $collectionStore.activeCollectionId) ?? null
  $: activeFlow =
    activeCollection?.flows.find(f => f.id === $collectionStore.activeFlowId) ??
    activeCollection?.flows[0] ??
    null

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      paletteOpen = true
    }
  }

  function handleSidebarSelect(e: CustomEvent<{ collectionName: string; flowId: string }>) {
    collectionStore.setActive(e.detail.collectionName, e.detail.flowId)
  }

  function handlePaletteSelect(e: CustomEvent<{ type: string; id: string; name: string; collection: string }>) {
    collectionStore.setActive(e.detail.collection, e.detail.id)
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app">
  <!-- Titlebar -->
  <div class="titlebar">
    <div class="traffic">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="title">⚡ FlowProbe</div>
    <div class="actions">
      <button class="env-btn">staging ▾</button>
      <button class="run-btn">▶ Run Collection</button>
    </div>
  </div>

  <!-- Main body -->
  <div class="body">
    <Sidebar
      {collections}
      activeCollectionId={$collectionStore.activeCollectionId}
      activeFlowId={$collectionStore.activeFlowId}
      on:select={handleSidebarSelect}
    />

    {#if activeFlow}
      <FlowCanvas
        flow={activeFlow}
        result={activeFlowResult ?? undefined}
        {selectedStepId}
        on:selectStep={e => (selectedStepId = e.detail)}
      />
    {:else}
      <div class="empty-canvas">Open a collection to get started</div>
    {/if}

    <ResultPanel result={activeFlowResult} {selectedStepId} />
  </div>

  <!-- Statusbar -->
  <div class="statusbar">
    <span class="sb-item">
      <span class="dot green"></span>kafka-local:9092
    </span>
    <span class="sb-sep"></span>
    <span class="sb-item">{collections.length} collection{collections.length !== 1 ? 's' : ''}</span>
    <span class="sb-sep"></span>
    <span class="sb-item sb-right">FlowProbe v0.1.0</span>
  </div>
</div>

<CommandPalette
  open={paletteOpen}
  {collections}
  on:select={handlePaletteSelect}
  on:close={() => (paletteOpen = false)}
/>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text-primary);
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Titlebar ── */
  .titlebar {
    height: 40px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 8px;
    flex-shrink: 0;
  }

  .traffic {
    display: flex;
    gap: 6px;
  }

  .traffic span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--border);
  }

  .title {
    flex: 1;
    text-align: center;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .env-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 4px 10px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: border-color var(--dur-fast);
  }

  .env-btn:hover {
    border-color: var(--border-hover);
  }

  .run-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    padding: 5px 14px;
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background var(--dur-fast);
  }

  .run-btn:hover {
    background: var(--accent-hover);
  }

  /* ── Body ── */
  .body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .empty-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-md);
    color: var(--text-muted);
    background: var(--bg);
  }

  /* ── Statusbar ── */
  .statusbar {
    height: 26px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 14px;
    flex-shrink: 0;
  }

  .sb-item {
    font-size: var(--text-xs);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sb-right {
    margin-left: auto;
  }

  .sb-sep {
    width: 1px;
    height: 12px;
    background: var(--border);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .dot.green {
    background: var(--success);
  }
</style>
