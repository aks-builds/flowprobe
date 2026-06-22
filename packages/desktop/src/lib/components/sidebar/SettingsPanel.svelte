<script lang="ts">
  import { themeStore } from '../../stores/theme.js'
</script>

<div class="settings-panel">
  <div class="sp-section">
    <div class="sp-title">Appearance</div>
    <div class="sp-row">
      <span class="sp-label">Theme</span>
      <button
        class="theme-toggle"
        onclick={() => themeStore.toggle()}
        aria-label="Toggle dark/light theme"
      >
        {$themeStore === 'dark' ? '🌙 Dark' : '☀️ Light'}
      </button>
    </div>
  </div>

  <div class="sp-section">
    <div class="sp-title">Keyboard Shortcuts</div>
    {#each [
      { key: 'Ctrl+K', desc: 'Command palette' },
      { key: 'Ctrl+R', desc: 'Run collection' },
      { key: 'Ctrl+O', desc: 'Open file' },
      { key: 'Ctrl+T', desc: 'New tab' },
      { key: 'Ctrl+W', desc: 'Close tab' },
    ] as sh}
      <div class="sp-shortcut">
        <kbd class="sp-key">{sh.key}</kbd>
        <span class="sp-desc">{sh.desc}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .settings-panel { padding: 10px 10px; }
  .sp-section { margin-bottom: 16px; }
  .sp-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted, #334155); padding: 0 4px 6px; }
  .sp-row { display: flex; align-items: center; justify-content: space-between; padding: 4px; }
  .sp-label { font-size: 11px; color: var(--text-secondary, #475569); }
  .theme-toggle { padding: 4px 10px; border-radius: 7px; font-size: 10.5px; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); color: var(--text-secondary, #475569); cursor: pointer; }
  .theme-toggle:hover { border-color: var(--accent, #6366f1); color: var(--text-primary, #e2e8f0); }
  .sp-shortcut { display: flex; align-items: center; gap: 8px; padding: 3px 4px; }
  .sp-key { font-family: var(--font-mono, monospace); font-size: 9px; background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); padding: 2px 5px; border-radius: 4px; color: var(--text-secondary, #475569); }
  .sp-desc { font-size: 10px; color: var(--text-muted, #334155); }
</style>
