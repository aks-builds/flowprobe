<script lang="ts">
  import { onMount } from 'svelte'
  import { check } from '@tauri-apps/plugin-updater'
  import { relaunch } from '@tauri-apps/plugin-process'

  let availableVersion = $state<string | null>(null)
  let installing = $state(false)

  onMount(async () => {
    try {
      const update = await check()
      if (update?.available) availableVersion = update.version
    } catch { /* offline or no update */ }
  })

  async function installUpdate() {
    installing = true
    try {
      const update = await check()
      if (update?.available) {
        await update.downloadAndInstall()
        await relaunch()
      }
    } catch (e) {
      console.error('Update failed:', e)
      installing = false
    }
  }
</script>

{#if availableVersion}
  <div class="update-chip" role="status">
    v{availableVersion} available
    <button class="update-btn" onclick={installUpdate} disabled={installing}>
      {installing ? 'Installing…' : 'Restart to update'}
    </button>
    <button class="dismiss" onclick={() => availableVersion = null} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .update-chip {
    display: flex; align-items: center; gap: 8px;
    font-size: 9.5px; color: #a5b4fc;
  }
  .update-btn {
    padding: 1px 7px; border-radius: 4px; font-size: 9px; font-weight: 700;
    background: rgba(99,102,241,.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,.35); cursor: pointer;
  }
  .update-btn:disabled { opacity: .6; cursor: not-allowed; }
  .dismiss { background: none; border: none; color: #475569; cursor: pointer; font-size: 10px; }
</style>
