<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { onMount } from 'svelte'
  import LogoMark from '../assets/LogoMark.svelte'
  import { navStore, type NavTab } from '../stores/nav.js'
  import { runStore } from '../stores/collection.js'

  const tabs: { id: NavTab; label: string; icon: string }[] = [
    { id: 'collections',  label: 'Collections',  icon: '⚡' },
    { id: 'environments', label: 'Environments', icon: '🌐' },
    { id: 'history',      label: 'History',      icon: '📜' },
    { id: 'settings',     label: 'Settings',     icon: '⚙' },
  ]

  let appWindow: Awaited<ReturnType<typeof getCurrentWindow>> | null = $state(null)
  let isMaximized = $state(false)

  onMount(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    appWindow = getCurrentWindow()
    isMaximized = await appWindow.isMaximized()
  })

  async function toggleMaximize() {
    if (!appWindow) return
    await appWindow.toggleMaximize()
    isMaximized = await appWindow.isMaximized()
  }
</script>

<div class="titlebar" data-tauri-drag-region>
  <!-- Logo mark — no text -->
  <div class="logo-wrap" data-tauri-drag-region="false">
    <LogoMark size={24} />
  </div>

  <!-- Navigation tabs -->
  <nav class="tb-nav" data-tauri-drag-region="false" aria-label="Main navigation">
    {#each tabs as tab}
      <button
        class="tb-tab"
        class:active={$navStore === tab.id}
        onclick={() => navStore.set(tab.id)}
        aria-current={$navStore === tab.id ? 'page' : undefined}
      >
        <span class="tb-tab-icon" aria-hidden="true">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </nav>

  <!-- Right group: window controls spacer -->
  <div class="tb-right" data-tauri-drag-region="false"></div>

  <!-- Window controls (Windows-style) -->
  <div class="wc" data-tauri-drag-region="false">
    <button class="wc-btn" onclick={() => appWindow?.minimize()} aria-label="Minimize">─</button>
    <button class="wc-btn" onclick={toggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
      {isMaximized ? '❐' : '⬜'}
    </button>
    <button class="wc-btn close" onclick={() => appWindow?.close()} aria-label="Close">✕</button>
  </div>
</div>

<style>
  .titlebar {
    height: var(--titlebar-h, 40px);
    background: var(--titlebar-bg, #040408);
    border-bottom: 1px solid var(--border, #161628);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 10px;
    flex-shrink: 0;
    user-select: none;
  }

  .logo-wrap { flex-shrink: 0; display: flex; align-items: center; }

  .tb-nav { display: flex; gap: 2px; flex: 1; }

  .tb-tab {
    padding: 5px 11px;
    border-radius: 7px;
    font-size: 10.5px;
    color: var(--text-muted, #334155);
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
  }
  .tb-tab:hover:not(.active) {
    background: rgba(255,255,255,.04);
    color: var(--text-secondary, #475569);
  }
  .tb-tab.active {
    background: rgba(99,102,241,.13);
    color: #a5b4fc;
  }
  .tb-tab-icon { font-size: 12px; }

  .tb-right { flex-shrink: 0; }

  .wc { display: flex; }

  .wc-btn {
    width: 34px;
    height: 40px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted, #334155);
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
  }
  .wc-btn:hover {
    background: rgba(255,255,255,.05);
    color: var(--text-secondary, #475569);
  }
  .wc-btn.close:hover {
    background: rgba(239,68,68,.12);
    color: #ef4444;
  }

  @media (prefers-reduced-motion: reduce) {
    .tb-tab, .env-chip, .wc-btn { transition: none; }
  }
</style>
