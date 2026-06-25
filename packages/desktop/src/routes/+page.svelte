<!-- packages/desktop/src/routes/+page.svelte -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { Channel } from '@tauri-apps/api/core'
  import { getVersion } from '@tauri-apps/api/app'
  import { onDestroy, onMount } from 'svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import FlowCanvas from '$lib/components/FlowCanvas.svelte'
  import AnalysisDock from '$lib/components/dock/AnalysisDock.svelte'
  import CommandPalette from '$lib/components/CommandPalette.svelte'
  import ErrorBanner from '$lib/components/ErrorBanner.svelte'
  import UpdateBanner from '$lib/components/UpdateBanner.svelte'
  import WorkspaceTabs from '$lib/components/WorkspaceTabs.svelte'
  import { collectionStore, runStore, validateFlow, type ValidationError } from '$lib/stores/collection.js'
  import { workspaceStore } from '$lib/stores/workspace.js'
  import { historyStore } from '$lib/stores/history.js'
  import { environmentStore, activeEnvironment } from '$lib/stores/environments.js'
  import type { Collection } from '@flowprobe/core'
  import { parseCollection } from '@flowprobe/core/schema'
  import type { LogEntry } from '$lib/components/EventStreamDrawer.svelte'

  // ── App version ──
  let appVersion = '...'

  // ── Run state ──
  let runError: string | null = null
  let validationErrors: ValidationError[] = []
  let showConfetti = false
  let confettiTimer: ReturnType<typeof setTimeout> | null = null
  let isStopped = false
  let runStartedAt: string | null = null
  // ── App state ──
  let paletteOpen = false
  let selectedStepId: string | null = null
  let collections: Collection[] = []
  let activeRunCount = 0
  let logs: LogEntry[] = []

  collectionStore.subscribe(s => { collections = s.collections })

  onMount(() => {
    historyStore.load()
    environmentStore.load()
    getVersion().then(v => appVersion = v).catch(() => {})
  })

  $: activeCollection = collections.find(c => c.name === $collectionStore.activeCollectionId)
  $: activeFlow = activeCollection?.flows.find(f => f.id === $collectionStore.activeFlowId) ?? activeCollection?.flows[0]
  $: brokers = activeFlow
    ? [...new Set(activeFlow.steps
        .filter(s => s.type === 'producer' || s.type === 'wait' || s.type === 'message-assert')
        .flatMap(s => {
          if (s.type === 'producer') return [s.broker]
          if (s.type === 'wait') return [s.consumer?.broker ?? '']
          if (s.type === 'message-assert') return [s.broker]
          return []
        })
        .filter(Boolean)
      )].map(id => ({ id }))
    : []

  // Derive selectedStep for ResultPanel
  $: selectedStep = activeFlow?.steps.find(s => s.id === selectedStepId) ?? null

  // Validate on flow change
  $: if (activeFlow) {
    validationErrors = validateFlow(activeFlow)
  } else {
    validationErrors = []
  }
  $: canRun = activeFlow != null && validationErrors.length === 0 && $runStore.state !== 'running'
  $: isRunning = $runStore.state === 'running'

  // Build FlowRunResult for ResultPanel from runStore results
  $: flowRunResult = $runStore.results.length > 0 ? {
    id: activeFlow?.id ?? '',
    name: activeFlow?.name ?? '',
    passed: $runStore.results.every(r => r.passed),
    durationMs: $runStore.results.reduce((s, r) => s + r.durationMs, 0),
    steps: $runStore.results,
  } : null

  // ── Run collection ──
  async function handleRun() {
    if (!canRun || !activeFlow || !activeCollection) return
    runError = null
    logs = []
    isStopped = false
    runStore.startRun()
    runStartedAt = new Date().toISOString()
    activeRunCount++

    const channel = new Channel<{ type: string; [key: string]: unknown }>()

    channel.onmessage = (event) => {
      if (isStopped) return
      if (event.type === 'stepDone') {
        runStore.addResult({
          id: event.id as string,
          type: (event.step_type ?? event.stepType) as string,
          passed: event.passed as boolean,
          durationMs: (event.duration_ms ?? event.durationMs) as number,
          error: event.passed ? undefined : (event.detail as string),
        })
      }
      if (event.type === 'runDone') {
        runStore.finishRun()
        if (activeFlow && activeCollection) {
          historyStore.record({
            runId: crypto.randomUUID(),
            flowId: activeFlow.id,
            flowName: activeFlow.name,
            collectionName: activeCollection.name,
            environment: $activeEnvironment?.name ?? null,
            startedAt: runStartedAt ?? new Date().toISOString(),
            durationMs: (event.duration_ms ?? event.durationMs) as number,
            passed: (event.passed) as number,
            failed: (event.failed) as number,
          })
        }
        const failed = event.failed as number
        if (failed === 0) {
          showConfetti = true
          if (confettiTimer) clearTimeout(confettiTimer)
          confettiTimer = setTimeout(() => { showConfetti = false }, 2500)
        }
      }
      if (event.type === 'log') {
        logs = [...logs, {
          timestampMs: (event.timestamp_ms ?? event.timestampMs) as number,
          level: event.level as string,
          message: event.message as string,
        }]
      }
      if (event.type === 'error') {
        runStore.setError(event.message as string)
        runError = event.message as string
      }
    }

    try {
      const collectionJson = JSON.stringify({
        version: '1',
        name: activeCollection.name,
        flows: activeFlow ? [activeFlow] : activeCollection.flows,
      })
      await invoke('run_collection', {
        collectionJson,
        flowId: activeFlow.id,
        channel,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      runStore.setError(message)
      runError = message
    } finally {
      // channel goes out of scope; Rust side detects dropped receiver
    }
  }

  function handleStop() {
    isStopped = true
    runStore.abortRun()
    // Channel will be garbage collected; Rust side checks for send errors
  }

  async function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); paletteOpen = true }
    if ((e.metaKey || e.ctrlKey) && e.key === 'r' && canRun) { e.preventDefault(); handleRun() }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault()
      try {
        const json = await invoke<string | null>('open_collection_dialog')
        if (json) {
          const collection = parseCollection(JSON.parse(json))
          collectionStore.loadCollection(collection)
          collectionStore.setActive(collection.name, collection.flows[0]?.id)
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : String(err)
      }
    }
  }

  onDestroy(() => { if (confettiTimer) clearTimeout(confettiTimer) })
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app">
  <!-- Confetti bar on all-pass -->
  {#if showConfetti}
    <div class="confetti-bar"></div>
  {/if}

  <!-- Run bar (replaces the old titlebar run button) -->
  <div class="run-bar">
    {#if isRunning}
      <button class="btn-stop" onclick={handleStop}>■ Stop</button>
    {:else}
      <button
        class="btn-run"
        onclick={handleRun}
        disabled={!canRun}
        title={!activeFlow ? 'No flow selected' : validationErrors.length > 0 ? `${validationErrors.length} validation errors` : 'Run collection (Ctrl+R)'}
      >▶ Run Collection</button>
    {/if}
    <span class="run-count" class:running={isRunning} class:passed={$runStore.state === 'done' && $runStore.results.every(r => r.passed)}>
      #{activeRunCount}
    </span>
  </div>

  <!-- Validation / run error banner -->
  {#if validationErrors.length > 0 && !isRunning}
    <ErrorBanner
      message="{validationErrors.length} step{validationErrors.length > 1 ? 's have' : ' has'} errors — fix them before running"
      level="warning"
      on:dismiss={() => { validationErrors = activeFlow ? validateFlow(activeFlow) : [] }}
    />
  {/if}
  {#if runError}
    <ErrorBanner message={runError} level="error" autoDismissMs={8000} on:dismiss={() => runError = null} />
  {/if}

  <!-- Body -->
  <div class="body">
    <svelte:boundary onerror={(err, reset) => { runError = `Component error: ${(err as Error).message}`; reset() }}>
      <Sidebar {brokers} {collections} activeCollectionId={$collectionStore.activeCollectionId} activeFlowId={$collectionStore.activeFlowId}
        on:select={e => {
          collectionStore.setActive(e.detail.collectionName, e.detail.flowId)
          if (e.detail.flowId) workspaceStore.openFlow(e.detail.collectionName, e.detail.flowId)
        }} />
    </svelte:boundary>

    <div class="canvas-column">
      <WorkspaceTabs />

      <div class="canvas-row">
        <svelte:boundary onerror={(err) => { runError = `Canvas error: ${(err as Error).message}` }}>
          {#if activeFlow}
            <FlowCanvas
              flow={activeFlow}
              {logs}
              result={flowRunResult ?? undefined}
              {selectedStepId}
              {validationErrors}
              on:selectStep={e => selectedStepId = e.detail}
              on:saveStep={e => {
                if (activeCollection) collectionStore.updateStep(activeCollection.name, activeFlow!.id, e.detail)
              }}
              on:addStep={e => {
                if (activeCollection) collectionStore.addStep(activeCollection.name, activeFlow!.id, e.detail)
              }}
            />
          {:else}
            <div class="empty-canvas">
              <div class="empty-title">No collection open</div>
              <div class="empty-hint">Open a .flowprobe.json file or drag one here</div>
            </div>
          {/if}
          {#snippet failed()}
            <div class="error-boundary-fallback">Canvas crashed — <button onclick={() => runStore.reset()}>Reset</button></div>
          {/snippet}
        </svelte:boundary>

        <svelte:boundary onerror={(err) => { console.error('AnalysisDock error:', err) }}>
          <AnalysisDock activeFlow={activeFlow ?? null} />
        </svelte:boundary>
      </div>
    </div>
  </div>

  <!-- Statusbar -->
  <div class="stbar">
    <span class="st-item">⚡ v{appVersion}</span>
    <span class="st-sep"></span>
    <span class="st-item">{collections.length} collection{collections.length !== 1 ? 's' : ''}</span>
    {#if isRunning}
      <span class="st-sep"></span>
      <span class="st-item" style="color:#3b82f6">● Running…</span>
    {/if}
    {#if $runStore.state === 'done'}
      <span class="st-sep"></span>
      <span class="st-item" style="color:{$runStore.results.every(r => r.passed) ? 'var(--success)' : 'var(--error)'}">
        {$runStore.results.filter(r => r.passed).length}/{$runStore.results.length} passed
      </span>
    {/if}
    <span class="st-sep" style="margin-left:auto"></span>
    <UpdateBanner />
    <span class="st-item" style="color:var(--text-muted);font-family:var(--font-mono);font-size:9px">Ctrl+K</span>
  </div>
</div>

<CommandPalette open={paletteOpen} {collections} on:close={() => paletteOpen = false}
  on:select={e => {
    if (e.detail.type === 'flow' && e.detail.collectionName) {
      collectionStore.setActive(e.detail.collectionName, e.detail.id)
    }
    paletteOpen = false
  }} />

<style>
  .app { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .run-bar {
    height: 36px;
    background: var(--bg, #07070f);
    border-bottom: 1px solid var(--border, #161628);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 10px;
    flex-shrink: 0;
  }
  .btn-run {
    background: var(--accent, #6366f1);
    color: #fff;
    border: none;
    border-radius: var(--radius-md, 8px);
    padding: 5px 16px;
    font-size: var(--text-sm, 11px);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-fast, 150ms), opacity var(--dur-fast, 150ms);
  }
  .btn-run:hover:not(:disabled) { background: #4f46e5; }
  .btn-run:disabled { opacity: .45; cursor: not-allowed; }
  .btn-stop {
    background: var(--error-light, #fee2e2);
    border: 1px solid #fecaca;
    color: var(--error, #ef4444);
    border-radius: var(--radius-md, 8px);
    padding: 5px 14px;
    font-size: var(--text-sm, 11px);
    font-weight: 700;
    cursor: pointer;
  }
  .run-count {
    font-size: 10px;
    color: var(--text-muted, #475569);
    font-family: var(--font-mono, monospace);
  }
  .run-count.running { color: #3b82f6; }
  .run-count.passed { color: var(--success, #22c55e); }
  @media (prefers-reduced-motion: reduce) {
    .btn-run { transition: none; }
  }
  .confetti-bar { height: 3px; background: linear-gradient(90deg, #16a34a, #4ade80, #86efac, #4ade80, #16a34a); background-size: 300% 100%; animation: cbar 2s linear infinite; flex-shrink: 0; }
  @keyframes cbar { 0%{background-position:0% 0%} 100%{background-position:300% 0%} }
  @media (prefers-reduced-motion: reduce) {
    .confetti-bar { animation: none; }
  }
  .body { flex: 1; display: flex; overflow: hidden; }
  .canvas-column { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .canvas-row { flex: 1; display: flex; overflow: hidden; }
  .empty-canvas { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--bg); }
  .empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); }
  .empty-hint { font-size: var(--text-sm); color: var(--text-muted); }
  .stbar { height: 26px; background: var(--bg); border-top: 1px solid var(--border); display: flex; align-items: center; padding: 0 14px; gap: 10px; flex-shrink: 0; }
  .st-item { font-size: var(--text-xs); color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
  .st-sep { width: 1px; height: 12px; background: var(--border); }
  .error-boundary-fallback { flex: 1; display: flex; align-items: center; justify-content: center; background: var(--error-light); color: var(--error); font-size: var(--text-sm); gap: 8px; }
</style>
