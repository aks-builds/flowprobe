<script lang="ts">
  import { onMount } from 'svelte'
  import { environmentStore, activeEnvironment } from '../../stores/environments.js'

  let newEnvName = $state('')
  let showSecrets = $state<Record<string, boolean>>({})
  let addingVar = $state<string | null>(null)
  let newVarKey = $state('')
  let newVarValue = $state('')
  let newVarSecret = $state(false)

  onMount(() => environmentStore.load())

  function addEnv() {
    if (!newEnvName.trim()) return
    environmentStore.addEnv(newEnvName.trim())
    newEnvName = ''
  }

  function submitVar(envName: string) {
    if (!newVarKey.trim()) return
    environmentStore.setVar(envName, newVarKey.trim(), newVarValue, newVarSecret)
    addingVar = null
    newVarKey = ''
    newVarValue = ''
    newVarSecret = false
  }

  function maskValue(value: string) {
    return '•'.repeat(Math.min(value.length, 12))
  }
</script>

<div class="env-panel">
  <div class="ep-header">
    <input
      class="ep-input"
      placeholder="New environment name…"
      bind:value={newEnvName}
      onkeydown={e => e.key === 'Enter' && addEnv()}
    />
    <button class="ep-add-btn" onclick={addEnv} aria-label="Add environment">+</button>
  </div>

  {#each $environmentStore.environments as env (env.name)}
    <div class="env-card" class:active={$activeEnvironment?.name === env.name}>
      <div class="env-card-header">
        <button class="env-name-btn" onclick={() => environmentStore.setActive(env.name)}>
          <div class="env-dot" class:active-dot={$activeEnvironment?.name === env.name}></div>
          {env.name}
          {#if $activeEnvironment?.name === env.name}
            <span class="active-badge">ACTIVE</span>
          {/if}
        </button>
        <button class="ep-remove" onclick={() => environmentStore.removeEnv(env.name)} aria-label="Remove {env.name}">✕</button>
      </div>

      <div class="env-vars">
        {#each env.vars as v (v.key)}
          <div class="ev-row">
            <span class="ev-key">{v.key}</span>
            <span class="ev-val" class:secret={v.secret}>
              {#if v.secret && !showSecrets[env.name + v.key]}
                {maskValue(v.value)}
                <button class="reveal" onclick={() => showSecrets[env.name + v.key] = true} aria-label="Reveal {v.key}">👁</button>
              {:else}
                {v.value}
                {#if v.secret}
                  <button class="reveal" onclick={() => { const { [env.name + v.key]: _, ...rest } = showSecrets; showSecrets = rest }} aria-label="Hide {v.key}">🙈</button>
                {/if}
              {/if}
            </span>
            <button class="ev-remove" onclick={() => environmentStore.removeVar(env.name, v.key)} aria-label="Remove {v.key}">−</button>
          </div>
        {/each}

        {#if addingVar === env.name}
          <div class="new-var-form">
            <input class="nv-input" placeholder="KEY" bind:value={newVarKey} />
            <input class="nv-input" placeholder="value" bind:value={newVarValue} />
            <label><input type="checkbox" bind:checked={newVarSecret} /> Secret</label>
            <button class="nv-save" onclick={() => submitVar(env.name)}>Add</button>
            <button class="nv-cancel" onclick={() => addingVar = null}>✕</button>
          </div>
        {:else}
          <button class="add-var-btn" onclick={() => addingVar = env.name}>+ Add variable</button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .env-panel { padding: 10px; }
  .ep-header { display: flex; gap: 6px; margin-bottom: 10px; }
  .ep-input { flex: 1; height: 27px; background: rgba(255,255,255,.04); border: 1px solid var(--border2, #1e1e32); border-radius: 7px; padding: 0 8px; font-size: 10.5px; color: var(--text-primary, #e2e8f0); outline: none; }
  .ep-input:focus { border-color: var(--accent, #6366f1); }
  .ep-add-btn { width: 27px; height: 27px; border-radius: 7px; background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.3); color: #818cf8; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .env-card { background: var(--surface2, #111120); border: 1px solid var(--border2, #1e1e32); border-radius: 9px; padding: 9px 10px; margin-bottom: 8px; }
  .env-card.active { border-color: rgba(99,102,241,.4); }
  .env-card-header { display: flex; align-items: center; margin-bottom: 7px; }
  .env-name-btn { flex: 1; background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); text-align: left; }
  .env-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted, #334155); }
  .env-dot.active-dot { background: var(--success, #22c55e); }
  .active-badge { font-size: 8px; background: rgba(34,197,94,.15); color: var(--success, #22c55e); padding: 1px 5px; border-radius: 4px; font-weight: 700; }
  .ep-remove { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 10px; padding: 0 2px; }
  .ep-remove:hover { color: var(--error, #ef4444); }
  .ev-row { display: flex; align-items: center; gap: 6px; font-size: 10px; margin-bottom: 3px; }
  .ev-key { color: var(--text-muted, #334155); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono, monospace); font-size: 9.5px; }
  .ev-val { flex: 1; font-family: var(--font-mono, monospace); font-size: 9px; color: var(--cyan, #06b6d4); display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev-val.secret { color: var(--text-muted, #334155); letter-spacing: 2px; }
  .reveal { background: none; border: none; cursor: pointer; font-size: 11px; flex-shrink: 0; }
  .ev-remove { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 10px; }
  .ev-remove:hover { color: var(--error, #ef4444); }
  .add-var-btn { font-size: 9.5px; color: var(--accent, #6366f1); background: none; border: none; cursor: pointer; padding: 3px 0; }
  .add-var-btn:hover { text-decoration: underline; }
  .new-var-form { display: flex; gap: 5px; align-items: center; margin-top: 5px; flex-wrap: wrap; }
  .nv-input { height: 24px; flex: 1; min-width: 60px; background: rgba(255,255,255,.04); border: 1px solid var(--border2, #1e1e32); border-radius: 5px; padding: 0 6px; font-size: 9.5px; color: var(--text-primary, #e2e8f0); outline: none; }
  .nv-input:focus { border-color: var(--accent, #6366f1); }
  .nv-save { padding: 2px 8px; border-radius: 5px; background: var(--accent, #6366f1); color: #fff; border: none; font-size: 9.5px; cursor: pointer; }
  .nv-cancel { background: none; border: none; color: var(--text-muted, #334155); cursor: pointer; font-size: 11px; }
  label { font-size: 9px; color: var(--text-muted, #334155); display: flex; align-items: center; gap: 4px; }
</style>
