<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import LogoMark from '../assets/LogoMark.svelte'
  import { navStore, type NavTab } from '../stores/nav.js'
  import { runStore } from '../stores/collection.js'

  const appWindow = getCurrentWindow()

  const tabs: { id: NavTab; label: string; icon: string }[] = [
    { id: 'collections',  label: 'Collections',  icon: '⚡' },
    { id: 'environments', label: 'Environments', icon: '🌐' },
    { id: 'history',      label: 'History',      icon: '📜' },
    { id: 'settings',     label: 'Settings',     icon: '⚙' },
  ]

  let isMaximized = $state(false)

  async function toggleMaximize() {
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

  <!-- Right group: env selector, run counter, run button -->
  <div class="tb-right" data-tauri-drag-region="false">
    <button class="env-chip" aria-label="Switch environment">
      <span class="env-alive" aria-hidden="true"></span>
      staging ▾
    </button>

    {#if $runStore.state !== 'idle'}
      <span class="run-badge" aria-label="Run count">
        #{$runStore.results.length > 0 ? 'N' : '0'}
      </span>
    {/if}

    <slot name="run-btn" />
  </div>

  <!-- Window controls (Windows-style) -->
  <div class="wc" data-tauri-drag-region="false">
    <button class="wc-btn" onclick={() => appWindow.minimize()} aria-label="Minimize">─</button>
    <button class="wc-btn" onclick={toggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
      {isMaximized ? '❐' : '⬜'}
    </button>
    <button class="wc-btn close" onclick={() => appWindow.close()} aria-label="Close">✕</button>
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

  .tb-right { display: flex; align-items: center; gap: 8px; }

  .env-chip {
    padding: 4px 9px;
    border-radius: 7px;
    font-size: 10px;
    background: rgba(255,255,255,.05);
    color: var(--text-secondary, #475569);
    border: 1px solid var(--border2, #1e1e32);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background var(--dur-fast, 150ms);
  }
  .env-chip:hover { background: rgba(255,255,255,.08); }

  .env-alive {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success, #22c55e);
  }

  .run-badge {
    font-size: 9px;
    color: var(--text-muted, #334155);
    font-family: var(--font-mono, monospace);
    background: rgba(255,255,255,.06);
    padding: 2px 5px;
    border-radius: 4px;
  }

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
